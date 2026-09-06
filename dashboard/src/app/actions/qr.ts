"use server";

import { HttpError } from "@/lib/errors";
import { checkMaliciousUrl } from "@/lib/malicious";
import { createQrRecord, deleteQrRecord, getQrRecord, updateQrRecord } from "@/lib/store";
import { normalizeAndValidateUrl } from "@/lib/url";

export async function createQrAction(input: { url: string; expiresAt?: string }) {
  const normalizedUrl = normalizeAndValidateUrl(input.url);
  const malicious = await checkMaliciousUrl(normalizedUrl);
  if (malicious.malicious) {
    throw new HttpError(400, "MALICIOUS_URL", malicious.reason ?? "URL flagged as malicious");
  }

  return createQrRecord({
    originalUrl: input.url,
    normalizedUrl,
    expiresAt: input.expiresAt ?? null,
  });
}

export async function updateQrAction(input: { token: string; url?: string; expiresAt?: string | null }) {
  let normalizedUrl: string | undefined;
  if (input.url !== undefined) {
    normalizedUrl = normalizeAndValidateUrl(input.url);
    const malicious = await checkMaliciousUrl(normalizedUrl);
    if (malicious.malicious) {
      throw new HttpError(400, "MALICIOUS_URL", malicious.reason ?? "URL flagged as malicious");
    }
  }

  return updateQrRecord(input.token, {
    originalUrl: input.url,
    normalizedUrl,
    expiresAt: input.expiresAt,
  });
}

export async function deleteQrAction(token: string) {
  return deleteQrRecord(token);
}

export async function getQrAction(token: string) {
  return getQrRecord(token);
}
