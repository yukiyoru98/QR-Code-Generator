# QR Code Generator Prototype

## System Requirements

Build a dynamic QR code system where:
- Users submit a long URL and get back a short URL token + QR code image
- The QR code encodes a short URL that redirects (302) to the original URL via your server.
- Users can modify the target URL after QR code creation
- Users can delete a QR code (soft delete)
- Users can optionally set an expiration timestamp on create or update
- Deleted or expired links return appropriate HTTP status codes
- URL validation: format check, normalization, malicious URL blocking

## Design Choices

1. **Token Generation:**
    * Random token + Base62 conversion
    * DB-level prevention for collision
    * Retry on collision
2. **Security:**
    * **Malicious URL blocking:** Use a library or service to check for known malicious URLs (e.g., phishing, malware). Reject if flagged.
    * **Input validation:** Reject empty URLs, invalid formats, or disallowed schemes (e.g., `javascript:`).
    
3. **Redirect Strategy:** 
    We use **302 (Temporary Redirect)** in a dynamic QR system because the destination **may change** (update URL, expire, soft-delete). A 302 signals to browsers/CDNs/search engines that the redirect is *not permanent*, so they’re less likely to cache it “forever.”
    
    **Trade-offs vs 301:**
    
    - **URL modification:**
        - **302:** better for editability—when the target changes, clients are more likely to re-check our redirect endpoint and follow the latest destination.
        - **301:** can be cached aggressively; after an update, some clients may keep sending users to the *old* URL for a long time.
    - **Analytics:**
        - **302:** more scans continue to hit `/r/{token}`, so we can log and count scans reliably.
            - **301:** if cached, future scans may bypass our server and go directly to the destination, reducing analytics accuracy.
            
4. **URL Normalization:** 
   **Normalization rules (typical, practical set):**
    - **Trim whitespace** and reject empty URLs.
    - **Parse with a real URL parser** (not regex) and require an allowed scheme (usually `http`/`https`).
            
        “**Parse with a real URL parser (not regex)**” means:
            
        Use a tool/library that *understands* URLs the same way a browser does, instead of trying to “guess” with a pattern (regular expression).
            
        - A **URL parser** can correctly split a URL into parts like **scheme** (`https`), **hostname** (`example.com`), **path** (`/page`), **query** (`?a=1`), and **port** (`:443`).
        - A **regex** is easy to get wrong for URLs, because URLs have lots of tricky cases (extra slashes, ports, encoded characters, IPv6 addresses, etc.). A regex might mistakenly accept a bad URL or reject a valid one.
        
        So the idea is: *let a dedicated URL-parsing function do the hard/fragile part*, then you can safely check rules like “only allow http/https” or “hostname must be present.”
            
    - **Lowercase the hostname** (domain is case-insensitive): `Example.COM` → `example.com`.
    - **Remove default ports**: `:80` for `http`, `:443` for `https`.
    - **Normalize the path**:
        - ensure it starts with `/`
        - optionally remove a trailing `/` *when safe for your product* (`/` vs `/about/` can be different on some servers)
        - resolve `.` and `..` segments.
    - **Normalize query string** (optional, depends on needs): sort parameters, drop known tracking params (e.g. `utm_*`) if your product wants de-duplication.
    - **Keep case for path/query by default**: unlike hostnames, `/A` and `/a` can be different resources.
    - **IDN/punycode normalization** for international domains (e.g., `münich.com` → punycode form).
    
    **Design choice for this QR system:**
    
    - For **safety + consistency**, you often **canonicalize to HTTPS** (if allowed) and/or do a one-time “follow redirects” check during creation to discover the final canonical URL.
    - But you should be aware this is a policy decision: some services genuinely serve different content on HTTP vs HTTPS, and some URLs may not support HTTPS.
5. **Error Semantics:** 
    - **Non-existent token** (never created, or random/invalid):
        - Return **404 Not Found**
        - Meaning: “I don’t have any record of this token.”
    - **Deleted link (soft-deleted)** (token existed before, but was intentionally removed):
        - Return **410 Gone**
        - Meaning: “This used to exist, but it’s been intentionally removed.”

    ### Why use different codes?
        
    - **Better debugging / clarity**: helps you (and clients) distinguish “typo/invalid” vs “revoked”.
    - **Security/product choice**:
        - If you *want privacy* (avoid revealing whether a token ever existed), you can choose to return **404 for both**.
        - If you *want correctness* (as in your verification section), use **404 vs 410**.
    
    ### Expiration
    treat it like “no longer available”:
    - commonly **410 Gone** (similar to deleted: it existed, but is no longer valid)
    - or **404 Not Found** if you want to avoid existence disclosure
    
    This matches your prototype checks: deleted → **410**, invalid → **404**.
        
## Verification

Your prototype should pass all of these:

```bash
# Create a QR code
curl -X POST http://localhost:8000/api/qr/create \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# → 200, returns {"token": "...", "short_url": "...", "qr_code_url": "...", "original_url": "..."}

# Redirect
curl -o /dev/null -w "%{http_code}" http://localhost:8000/r/{token}
# → 302

# Get info
curl http://localhost:8000/api/qr/{token}
# → 200, returns token metadata

# Update target URL
curl -X PATCH http://localhost:8000/api/qr/{token} \
  -H "Content-Type: application/json" \
  -d '{"url": "https://new-url.com"}'
# → 200

# Redirect now goes to new URL
curl -o /dev/null -w "%{redirect_url}" http://localhost:8000/r/{token}
# → https://new-url.com

# Delete
curl -X DELETE http://localhost:8000/api/qr/{token}
# → 200

# Redirect after delete
curl -o /dev/null -w "%{http_code}" http://localhost:8000/r/{token}
# → 410

# Non-existent token
curl -o /dev/null -w "%{http_code}" http://localhost:8000/r/INVALID
# → 404

# QR code image
# (create a new one first, then)
curl -o /dev/null -w "%{http_code} %{content_type}" http://localhost:8000/api/qr/{token}/image
# → 200 image/png

# Analytics
curl http://localhost:8000/api/qr/{token}/analytics
# → 200, returns {"token": "...", "total_scans": N, "scans_by_day": [...]}
```

## Tech Stack

### Core Architecture Overview

```
                        ┌───────────────────────────────┐
                        │     Edge Worker (Redirect)    │
                        │      (Cloudflare Workers)     │
                        └───────────────┬───────────────┘
                                        │
                ┌───────────────────────┴───────────────────────┐
                ▼                                               ▼
  ┌───────────────────────────┐                   ┌───────────────────────────┐
  │      READ / REDIRECT      │                   │      WRITE / MANAGEMENT   │
  │       Upstash Redis       │                   │   Supabase & Tinybird     │
  └───────────────────────────┘                   └───────────────────────────┘

```

---

### Definitive Tech Stack Plan

#### 1. Edge Redirection Engine

* **Tool:** **Cloudflare Workers**
* **Why:** Executes redirect logic directly at the edge data center closest to the scanning user, keeping cold starts under $1\text{ ms}$ globally.
* **Scale Strategy:** Add a **Stale-While-Revalidate (SWR)** in-memory cache directly inside the worker script. Hot token lookups will resolve in local memory under $5\text{ ms}$, absorbing viral traffic spikes without extra API calls or code changes.

#### 2. Fast Data Store (Token-to-URL Mapping & User Data)

* **Primary Key-Value Store:** **Upstash Redis**
* *Why:* Resolves `/r/{token}` lookups in under $15\text{ ms}$ over serverless HTTP/REST APIs at the edge.
* *Scale Strategy:* Scale the Upstash plan or back it with a managed Redis Cloud instance using the exact same Redis APIs and key structure (`qr:{token}`).


* **Relational Database:** **Supabase (PostgreSQL)**
* *Why:* Manages user accounts, subscriptions, and master records of target URLs.
* *Scale Strategy:* Provides standard PostgreSQL under the hood. Scale write IOPS on Supabase or migrate to AWS Aurora PostgreSQL without touching database schemas or ORM queries.



#### 3. Analytics Engine

* **Tool:** **Tinybird** (ClickHouse Cloud)
* **Why:** Columnar OLAP engine that ingests thousands of scan events per second without table locks. Exposes instant SQL-over-REST endpoints for dashboard analytics.
* **Scale Strategy:** The worker dispatches log payloads asynchronously via `ctx.waitUntil()` without blocking the `302 Redirect`. To scale further, keep Tinybird or point the HTTP ingest endpoint to a self-hosted ClickHouse cluster with zero changes to the event payload.

#### 4. Frontend Dashboard & Branded Links

* **Framework:** **Next.js** (App Router) + **Tailwind CSS**
* **QR Rendering Library:** **`qr-code-styling`**
* *Why:* Canvas/SVG rendering happens entirely in the user's browser, offloading image generation compute from the server.


* **Branded Links Engine:** **Cloudflare for SaaS**
* *Why:* Enables enterprise users to attach custom domains (`link.brand.com`) with automated TLS/SSL certificate issuance and CNAME routing.



---

### Definitive Architecture Summary

| Component | Selected Tool | Production Migration Strategy |
| --- | --- | --- |
| **Frontend & Admin UI** | Next.js + Tailwind CSS | Deploy on Cloudflare Pages |
| **Redirect Engine** | Cloudflare Workers | Add in-memory SWR caching in worker |
| **Fast URL Cache** | Upstash Redis | Zero changes (same Redis API) |
| **Primary Database** | Supabase PostgreSQL | Zero changes (Standard PostgreSQL schema) |
| **Analytics Engine** | Tinybird (ClickHouse) | Zero changes (Decoupled HTTP ingest API) |
| **QR Rendering** | `qr-code-styling` (Browser Canvas) | Add worker offloading for large bulk zip exports |
| **Branded Links** | Cloudflare for SaaS | Add custom CNAME routing API |

---

### Request Flow in Practice

1. **User updates URL in dashboard:**
* App writes destination URL to Supabase PostgreSQL.
* App updates key `qr:{token}` in Upstash Redis.
* *Edge worker serves the new URL globally on the next scan.*


2. **End user scans QR code:**
* Request hits `/r/{token}` on the nearest Cloudflare Worker edge node.
* Worker checks local in-memory SWR cache / Upstash Redis (~$5\text{–}15\text{ ms}$).
* Worker triggers non-blocking task (`ctx.waitUntil`) to post scan details (user agent, country, timestamp) to Tinybird.
* Worker immediately returns **HTTP 302** with `Location: <destination_url>`.