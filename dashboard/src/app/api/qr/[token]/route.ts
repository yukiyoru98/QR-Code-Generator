import { NextResponse } from "next/server";
import { z } from "zod";
import { asApiError, HttpError } from "@/lib/errors";
import { checkMaliciousUrl } from "@/lib/malicious";
import { assertActiveOrThrow, deleteQrRecord, getQrRecord, updateQrRecord } from "@/lib/store";
import { normalizeAndValidateUrl } from "@/lib/url";

export const runtime = "nodejs";

const updateSchema = z.object({
  url: z.string().min(1).optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const record = await getQrRecord(token);
    if (!record) {
      throw new HttpError(404, "NOT_FOUND", "Token not found");
    }

    assertActiveOrThrow(record);

    return NextResponse.json({
      token: record.token,
      short_url: record.short_url,
      original_url: record.original_url,
      normalized_url: record.normalized_url,
      expires_at: record.expires_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
  } catch (error) {
    return asApiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = updateSchema.parse(await request.json());

    if (body.url === undefined && body.expires_at === undefined) {
      throw new HttpError(400, "INVALID_REQUEST", "Provide at least one field to update");
    }

    let normalizedUrl: string | undefined;
    if (body.url !== undefined) {
      normalizedUrl = normalizeAndValidateUrl(body.url);
      const malicious = await checkMaliciousUrl(normalizedUrl);
      if (malicious.malicious) {
        throw new HttpError(400, "MALICIOUS_URL", malicious.reason ?? "URL flagged as malicious");
      }
    }

    const record = await updateQrRecord(token, {
      originalUrl: body.url,
      normalizedUrl,
      expiresAt: body.expires_at,
    });

    return NextResponse.json({
      token: record.token,
      short_url: record.short_url,
      original_url: record.original_url,
      normalized_url: record.normalized_url,
      expires_at: record.expires_at,
      updated_at: record.updated_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", code: "INVALID_REQUEST" }, { status: 400 });
    }

    return asApiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const record = await deleteQrRecord(token);

    return NextResponse.json({
      token: record.token,
      deleted_at: record.deleted_at,
      status: "deleted",
    });
  } catch (error) {
    return asApiError(error);
  }
}
