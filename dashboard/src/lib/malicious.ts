import { env } from "@/lib/env";

interface MaliciousResult {
  malicious: boolean;
  reason?: string;
}

export async function checkMaliciousUrl(url: string): Promise<MaliciousResult> {
  if (!env.MALICIOUS_CHECK_URL || !env.MALICIOUS_CHECK_API_KEY) {
    return { malicious: false };
  }

  try {
    const response = await fetch(env.MALICIOUS_CHECK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MALICIOUS_CHECK_API_KEY}`,
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { malicious: false };
    }

    const payload = (await response.json()) as {
      malicious?: boolean;
      is_malicious?: boolean;
      reason?: string;
    };

    const flagged = Boolean(payload.malicious ?? payload.is_malicious);
    if (!flagged) {
      return { malicious: false };
    }

    return {
      malicious: true,
      reason: payload.reason ?? "URL flagged by malicious URL provider",
    };
  } catch {
    return { malicious: false };
  }
}
