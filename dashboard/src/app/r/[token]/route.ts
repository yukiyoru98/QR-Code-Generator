import { HttpError } from "@/lib/errors";
import { assertActiveOrThrow, getQrPayload, getQrRecord, trackScan } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;

    const cached = await getQrPayload(token);
    if (cached) {
      assertActiveOrThrow(cached);
      await trackScan(token, request);
      return Response.redirect(cached.url, 302);
    }

    const record = await getQrRecord(token);
    if (!record) {
      throw new HttpError(404, "NOT_FOUND", "Token not found");
    }

    assertActiveOrThrow(record);
    await trackScan(token, request);
    return Response.redirect(record.normalized_url, 302);
  } catch (error) {
    if (error instanceof HttpError) {
      return new Response(error.message, {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    return new Response("Internal server error", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
