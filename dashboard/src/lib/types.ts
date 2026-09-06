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

export interface AnalyticsResponse {
  token: string;
  total_scans: number;
  scans_by_day: Array<{
    day: string;
    scans: number;
  }>;
}
