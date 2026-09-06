import { NextResponse } from "next/server";
import { asApiError } from "@/lib/errors";
import { getAnalytics } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const analytics = await getAnalytics(token);
    return NextResponse.json(analytics);
  } catch (error) {
    return asApiError(error);
  }
}
