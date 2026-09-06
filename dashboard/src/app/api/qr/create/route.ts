import { NextResponse } from "next/server";
import { z } from "zod";
import { asApiError, HttpError } from "@/lib/errors";
import { checkMaliciousUrl } from "@/lib/malicious";
import { createQrRecord } from "@/lib/store";
import { normalizeAndValidateUrl } from "@/lib/url";

export const runtime = "nodejs";

const createSchema = z.object({
  url: z.string().min(1),
  expires_at: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const normalizedUrl = normalizeAndValidateUrl(body.url);

    const malicious = await checkMaliciousUrl(normalizedUrl);
    if (malicious.malicious) {
      throw new HttpError(400, "MALICIOUS_URL", malicious.reason ?? "URL flagged as malicious");
    }

    const record = await createQrRecord({
      originalUrl: body.url,
      normalizedUrl,
      expiresAt: body.expires_at ?? null,
    });

    return NextResponse.json({
      token: record.token,
      short_url: record.short_url,
      qr_code_url: `/api/qr/${record.token}/image`,
      original_url: record.original_url,
      expires_at: record.expires_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid request",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    return asApiError(error);
  }
}
