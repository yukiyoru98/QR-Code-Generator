import { HttpError } from "@/lib/errors";

export const env = {
  BASE_SHORT_URL:
    process.env.BASE_SHORT_URL ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000"),
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  MALICIOUS_CHECK_URL: process.env.MALICIOUS_CHECK_URL,
  MALICIOUS_CHECK_API_KEY: process.env.MALICIOUS_CHECK_API_KEY,
};

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new HttpError(500, "INTERNAL_ERROR", `Missing environment variable: ${name}`);
  }
  return value;
}
