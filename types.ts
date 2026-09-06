export type Nullable<T> = T | null;

export interface QrRecord {
  id: string;
  token: string;
  original_url: string;
  normalized_url: string;
  short_url: string;
  deleted_at: Nullable<string>;
  expires_at: Nullable<string>;
  created_at: string;
  updated_at: string;
}

export interface RedisQrPayload {
  token: string;
  url: string;
  deleted_at: Nullable<string>;
  expires_at: Nullable<string>;
}

export interface ScanEvent {
  token: string;
  scanned_at: string;
  user_agent: string;
  country: string;
  referer: string;
  ip_hash: string;
}

export interface CreateQrRequest {
  url: string;
  expires_at?: string;
}

export interface UpdateQrRequest {
  url?: string;
  expires_at?: string | null;
}

export interface CreateQrResponse {
  token: string;
  short_url: string;
  qr_code_url: string;
  original_url: string;
  expires_at: Nullable<string>;
}

export interface ErrorBody {
  error: string;
  code:
    | "INVALID_REQUEST"
    | "INVALID_URL"
    | "MALICIOUS_URL"
    | "NOT_FOUND"
    | "GONE"
    | "INTERNAL_ERROR";
}

export interface AnalyticsResponse {
  token: string;
  total_scans: number;
  scans_by_day: Array<{
    day: string;
    scans: number;
  }>;
}
