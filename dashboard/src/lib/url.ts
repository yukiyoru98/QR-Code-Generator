import { isIP } from "node:net";
import path from "node:path";
import { HttpError } from "@/lib/errors";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "::1") {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return isPrivateIpv4(host);
  }

  return false;
}

export function normalizeAndValidateUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "INVALID_URL", "URL must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, "INVALID_URL", "URL format is invalid");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new HttpError(400, "INVALID_URL", "Only http and https URLs are allowed");
  }

  parsed.protocol = protocol;
  parsed.hostname = parsed.hostname.toLowerCase();

  if (isLocalOrPrivateHost(parsed.hostname)) {
    throw new HttpError(400, "INVALID_URL", "Local and private network targets are blocked");
  }

  if ((protocol === "http:" && parsed.port === "80") || (protocol === "https:" && parsed.port === "443")) {
    parsed.port = "";
  }

  let normalizedPath = path.posix.normalize(parsed.pathname || "/");
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }
  if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  parsed.pathname = normalizedPath;

  const keptParams = [...parsed.searchParams.entries()].filter(([key]) => !key.toLowerCase().startsWith("utm_"));
  keptParams.sort((a, b) => {
    const keyCmp = a[0].localeCompare(b[0]);
    if (keyCmp !== 0) return keyCmp;
    return a[1].localeCompare(b[1]);
  });

  parsed.search = "";
  for (const [key, value] of keptParams) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}
