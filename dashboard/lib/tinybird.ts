/**
 * Tinybird Definitions
 *
 * Define your datasources, endpoints, and client here.
 */

import {
  defineDatasource,
  defineEndpoint,
  Tinybird,
  node,
  t,
  p,
  engine,
  type InferRow,
  type InferParams,
  type InferOutputRow,
} from "@tinybirdco/sdk";

// ============================================================================
// Datasources
// ============================================================================

/**
 * Scan events datasource - tracks QR code scans
 */
export const scanEvents = defineDatasource("scan_events", {
  description: "QR code scan events",
  schema: {
    scanned_at: t.dateTime(),
    token: t.string(),
    user_agent: t.string(),
    referer: t.string(),
    ip_hash: t.string().nullable(),
    country: t.string().nullable(),
  },
  engine: engine.mergeTree({
    sortingKey: ["token", "scanned_at"],
  }),
});

export type ScanEventRow = InferRow<typeof scanEvents>;

// ============================================================================
// Endpoints
// ============================================================================

/**
 * Scan analytics endpoint - get scan counts for one QR code
 */
export const scanAnalytics = defineEndpoint("scan_analytics", {
  description: "Get scan counts for one QR code",
  params: {
    token: p.string(),
  },
  nodes: [
    node({
      name: "endpoint",
      sql: `
        SELECT toDate(scanned_at) AS day, count() AS scans
        FROM scan_events
        WHERE token = {{String(token)}}
        GROUP BY day
        ORDER BY day ASC
      `,
    }),
  ],
  output: {
    day: t.date(),
    scans: t.uint64(),
  },
});

export type ScanAnalyticsParams = InferParams<typeof scanAnalytics>;
export type ScanAnalyticsOutput = InferOutputRow<typeof scanAnalytics>;

// ============================================================================
// Client
// ============================================================================

export const tinybird = new Tinybird({
  datasources: { scanEvents },
  pipes: { scanAnalytics },
});
