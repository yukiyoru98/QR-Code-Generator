import QRCode from "qrcode";
import { asApiError, HttpError } from "@/lib/errors";
import { assertActiveOrThrow, getQrRecord } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const record = await getQrRecord(token);

    if (!record) {
      throw new HttpError(404, "NOT_FOUND", "Token not found");
    }
    assertActiveOrThrow(record);

    const pngBuffer = await QRCode.toBuffer(record.short_url, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
    });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return asApiError(error);
  }
}
