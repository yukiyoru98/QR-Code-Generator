import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export function asApiError(error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.code, error.message);
  }

  return jsonError(500, "INTERNAL_ERROR", "Internal server error");
}
