# Dynamic QR Code System Spec

## Scope

This repository contains two deployable applications:

- `worker/`: Cloudflare Worker for global redirects at `/r/{token}`.
- `dashboard/`: Next.js app for create/update/delete/info/image/analytics APIs.

## Runtime Decisions

- Package manager: `npm`
- Node: `24`
- TypeScript strict mode: `true`

## Functional Requirements

1. Create QR:
- Input: URL + optional `expires_at` timestamp.
- Output: `token`, `short_url`, `qr_code_url`, `original_url`.
- Token strategy: random bytes -> Base62 string, uniqueness enforced at DB level with collision retry.

2. Redirect:
- Route: `GET /r/{token}`
- Response:
  - `302` for active link.
  - `404` for unknown token.
  - `410` for soft-deleted or expired token.
- Worker reads key `qr:{token}` from Upstash Redis.
- Worker logs scan asynchronously to Tinybird using `ctx.waitUntil()`.

3. Read metadata:
- Route: `GET /api/qr/{token}`
- Returns token metadata from Supabase.

4. Update URL:
- Route: `PATCH /api/qr/{token}`
- Updatable: `url`, optional `expires_at`.
- Must normalize + validate URL, run malicious URL checks, update Supabase and sync Redis key.

5. Soft delete:
- Route: `DELETE /api/qr/{token}`
- Marks row deleted and expires Redis mapping.

6. QR image:
- Route: `GET /api/qr/{token}/image`
- Returns `image/png` for short URL.

7. Analytics:
- Route: `GET /api/qr/{token}/analytics`
- Returns aggregate payload:
  - `token`
  - `total_scans`
  - `scans_by_day`

## URL Validation and Normalization Rules

1. Trim whitespace; reject empty.
2. Parse with URL parser (no regex parsing).
3. Allowed schemes: `http`, `https` only.
4. Reject disallowed schemes and malformed URLs.
5. Lowercase hostname.
6. IDN normalization via URL parser punycode behavior.
7. Remove default ports (`:80` for http, `:443` for https).
8. Normalize path:
- ensure leading `/`
- resolve `.` and `..` segments
- remove trailing slash except root `/`
9. Keep path/query case.
10. Normalize query:
- drop `utm_*` params
- stable sort remaining params by key then value
11. Block private/local destinations:
- `localhost`
- hostnames ending in `.local`
- loopback, RFC1918 and local IP ranges:
  - `127.0.0.0/8`
  - `10.0.0.0/8`
  - `192.168.0.0/16`
  - `172.16.0.0/12`
12. Malicious URL blocking:
- Real external check hook via env-configured endpoint.
- Graceful fallback (allow) when hook is not configured.

## Error Semantics

- Non-existent token: `404 Not Found`
- Deleted token: `410 Gone`
- Expired token: `410 Gone`

## Data Contracts

See `types.ts` for DTOs and storage shapes.

## Key Storage

- Redis key: `qr:{token}`
- Redis value JSON:
  - `token`
  - `url`
  - `deleted_at` nullable ISO string
  - `expires_at` nullable ISO string

## Security Notes

- URLs must pass normalization + local/private host blocking.
- Optional malicious URL API hook is used when configured.
- Dashboard write endpoints assume trusted server credentials (Supabase service role).

## Verification Mapping

The following endpoints are implemented to satisfy verification:

- `POST /api/qr/create`
- `GET /r/{token}`
- `GET /api/qr/{token}`
- `PATCH /api/qr/{token}`
- `DELETE /api/qr/{token}`
- `GET /api/qr/{token}/image`
- `GET /api/qr/{token}/analytics`
