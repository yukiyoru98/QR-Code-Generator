import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { generateToken } from "@/lib/token";
import { tinybird } from "../../lib/tinybird";
import type { AnalyticsResponse, QrRecord, RedisQrPayload } from "@/lib/types";

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const supabase =
  env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false },
      })
    : null;

const useMemoryStore =
  process.env.USE_IN_MEMORY_STORE === "true" ||
  (env.SUPABASE_URL?.includes("mock-") ?? false) ||
  (env.UPSTASH_REDIS_REST_URL?.includes("mock-") ?? false);

const memoryQr = new Map<string, QrRecord>();
const memoryRedis = new Map<string, RedisQrPayload>();
const memoryScans: Array<{ token: string; created_at: string }> = [];

function keyFor(token: string) {
  return `qr:${token}`;
}

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

async function createMemoryRecord(params: {
  originalUrl: string;
  normalizedUrl: string;
  expiresAt: string | null;
}): Promise<QrRecord> {
  const shortBase = env.BASE_SHORT_URL.replace(/\/$/, "");

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const token = generateToken(8);
    if (memoryQr.has(token)) {
      continue;
    }

    const now = new Date().toISOString();
    const record: QrRecord = {
      id: randomUUID(),
      token,
      original_url: params.originalUrl,
      normalized_url: params.normalizedUrl,
      short_url: `${shortBase}/r/${token}`,
      deleted_at: null,
      expires_at: params.expiresAt,
      created_at: now,
      updated_at: now,
    };

    memoryQr.set(token, record);
    await cacheQrPayload(token, {
      token,
      url: record.normalized_url,
      deleted_at: record.deleted_at,
      expires_at: record.expires_at,
    });

    return record;
  }

  throw new HttpError(500, "INTERNAL_ERROR", "Could not generate a unique token");
}

export async function cacheQrPayload(token: string, payload: RedisQrPayload) {
  memoryRedis.set(keyFor(token), payload);

  if (!redis || useMemoryStore) {
    return;
  }

  try {
    await redis.set(keyFor(token), JSON.stringify(payload));
  } catch {
    // Allow graceful fallback to in-memory cache in local mode.
  }
}

export async function getQrPayload(token: string): Promise<RedisQrPayload | null> {
  const fallback = memoryRedis.get(keyFor(token));

  if (!redis || useMemoryStore) {
    return fallback ?? null;
  }

  try {
    const cached = await redis.get<string | null>(keyFor(token));
    if (!cached) {
      return fallback ?? null;
    }

    if (typeof cached === "string") {
      return JSON.parse(cached) as RedisQrPayload;
    }

    return cached as unknown as RedisQrPayload;
  } catch {
    return fallback ?? null;
  }
}

export async function getQrRecord(token: string): Promise<QrRecord | null> {
  if (!supabase || useMemoryStore) {
    return memoryQr.get(token) ?? null;
  }

  try {
    const { data, error } = await supabase
      .from("qr_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "INTERNAL_ERROR", error.message);
    }

    return (data as QrRecord | null) ?? null;
  } catch {
    return memoryQr.get(token) ?? null;
  }
}

export async function createQrRecord(params: {
  originalUrl: string;
  normalizedUrl: string;
  expiresAt: string | null;
}) {
  const shortBase = env.BASE_SHORT_URL.replace(/\/$/, "");

  if (!supabase || useMemoryStore) {
    return createMemoryRecord(params);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const token = generateToken(8);
    const shortUrl = `${shortBase}/r/${token}`;

    const { data, error } = await supabase
      .from("qr_links")
      .insert({
        token,
        original_url: params.originalUrl,
        normalized_url: params.normalizedUrl,
        short_url: shortUrl,
        expires_at: params.expiresAt,
      })
      .select("*")
      .single();

    if (!error && data) {
      await cacheQrPayload(token, {
        token,
        url: params.normalizedUrl,
        deleted_at: null,
        expires_at: params.expiresAt,
      });

      return data as QrRecord;
    }

    const isCollision = error?.code === "23505";
    if (isCollision) {
      continue;
    }

    if (!error) {
      throw new HttpError(500, "INTERNAL_ERROR", "Failed to create QR record");
    }

    // If network/database is unavailable, keep prototype usable with memory fallback.
    if (error.code === undefined) {
      return createMemoryRecord(params);
    }

    throw new HttpError(500, "INTERNAL_ERROR", error.message);
  }

  throw new HttpError(500, "INTERNAL_ERROR", "Could not generate a unique token");
}

export async function updateQrRecord(
  token: string,
  params: { originalUrl?: string; normalizedUrl?: string; expiresAt?: string | null },
) {
  const existing = await getQrRecord(token);
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Token not found");
  }
  if (existing.deleted_at || isExpired(existing.expires_at)) {
    throw new HttpError(410, "GONE", "Token has been deleted or expired");
  }

  const updates: Record<string, unknown> = {};
  if (params.originalUrl !== undefined) updates.original_url = params.originalUrl;
  if (params.normalizedUrl !== undefined) updates.normalized_url = params.normalizedUrl;
  if (params.expiresAt !== undefined) updates.expires_at = params.expiresAt;

  if (!supabase || useMemoryStore) {
    const next: QrRecord = {
      ...existing,
      original_url: (updates.original_url as string | undefined) ?? existing.original_url,
      normalized_url: (updates.normalized_url as string | undefined) ?? existing.normalized_url,
      expires_at: (updates.expires_at as string | null | undefined) ?? existing.expires_at,
      updated_at: new Date().toISOString(),
    };

    memoryQr.set(token, next);
    await cacheQrPayload(token, {
      token,
      url: next.normalized_url,
      deleted_at: next.deleted_at,
      expires_at: next.expires_at,
    });

    return next;
  }

  const { data, error } = await supabase
    .from("qr_links")
    .update(updates)
    .eq("token", token)
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "INTERNAL_ERROR", error?.message ?? "Failed to update QR record");
  }

  const record = data as QrRecord;
  await cacheQrPayload(token, {
    token,
    url: record.normalized_url,
    deleted_at: record.deleted_at,
    expires_at: record.expires_at,
  });

  return record;
}

export async function deleteQrRecord(token: string): Promise<QrRecord> {
  const existing = await getQrRecord(token);
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Token not found");
  }

  if (existing.deleted_at) {
    return existing;
  }

  const deletedAt = new Date().toISOString();

  if (!supabase || useMemoryStore) {
    const next: QrRecord = {
      ...existing,
      deleted_at: deletedAt,
      updated_at: deletedAt,
    };

    memoryQr.set(token, next);
    await cacheQrPayload(token, {
      token,
      url: next.normalized_url,
      deleted_at: next.deleted_at,
      expires_at: next.expires_at,
    });

    return next;
  }

  const { data, error } = await supabase
    .from("qr_links")
    .update({ deleted_at: deletedAt })
    .eq("token", token)
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "INTERNAL_ERROR", error?.message ?? "Failed to delete QR record");
  }

  const record = data as QrRecord;
  await cacheQrPayload(token, {
    token,
    url: record.normalized_url,
    deleted_at: record.deleted_at,
    expires_at: record.expires_at,
  });

  return record;
}

export async function trackScan(token: string, req: Request): Promise<void> {
  const userAgent = req.headers.get("user-agent") ?? "";
  const referer = req.headers.get("referer") ?? "";
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ipHash = forwardedFor ? Buffer.from(forwardedFor).toString("base64") : "";

  memoryScans.push({ token, created_at: new Date().toISOString() });

  if (supabase && !useMemoryStore) {
    try {
      await supabase.from("scan_events").insert({
        token,
        user_agent: userAgent,
        referer,
        ip_hash: ipHash,
      });
    } catch {
      // Keep redirect path resilient if analytics write fails.
    }
  }

  void tinybird.scanEvents
    .ingest({
        token,
        scanned_at: new Date().toISOString(),
        user_agent: userAgent,
        referer,
        ip_hash: ipHash || null,
        country: null,
      })
    .catch(() => {
      // Keep redirect path resilient if analytics write fails.
    });
}

export async function getAnalytics(token: string): Promise<AnalyticsResponse> {
  const existing = await getQrRecord(token);
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Token not found");
  }

  if (!supabase && !useMemoryStore) {
    const result = await tinybird.scanAnalytics.query({ token });
    const scans = result.data;

    return {
      token,
      total_scans: scans.reduce((total, scan) => total + Number(scan.scans), 0),
      scans_by_day: scans.map((scan) => ({
        day: String(scan.day),
        scans: Number(scan.scans),
      })),
    };
  }

  if (useMemoryStore) {
    const scans = memoryScans.filter((event) => event.token === token);
    const byDay = new Map<string, number>();

    for (const scan of scans) {
      const day = scan.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    return {
      token,
      total_scans: scans.length,
      scans_by_day: [...byDay.entries()].map(([day, count]) => ({ day, scans: count })),
    };
  }

  if (!supabase) {
    throw new HttpError(500, "INTERNAL_ERROR", "Analytics store is not configured");
  }

  const { data, error } = await supabase
    .from("scan_events")
    .select("created_at")
    .eq("token", token)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(500, "INTERNAL_ERROR", error.message);
  }

  const scans = data ?? [];
  const byDay = new Map<string, number>();
  for (const row of scans) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return {
    token,
    total_scans: scans.length,
    scans_by_day: [...byDay.entries()].map(([day, count]) => ({ day, scans: count })),
  };
}

export function assertActiveOrThrow(payload: RedisQrPayload | QrRecord) {
  if (payload.deleted_at || isExpired(payload.expires_at)) {
    throw new HttpError(410, "GONE", "Token has been deleted or expired");
  }
}
