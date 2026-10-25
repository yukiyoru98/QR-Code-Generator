interface RedisQrPayload {
	token: string;
	url: string;
	deleted_at: string | null;
	expires_at: string | null;
}

function jsonResponse(status: number, message: string) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function isExpired(expiresAt: string | null): boolean {
	return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

async function readUpstash(token: string, env: Env): Promise<RedisQrPayload | null> {
	const key = `qr:${token}`;
	const response = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
		headers: {
			Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
		},
	});

	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as { result: string | null };
	if (!payload.result) {
		return null;
	}

	return JSON.parse(payload.result) as RedisQrPayload;
}

async function sendTinybirdLog(request: Request, token: string, env: Env): Promise<void> {
	if (!env.TINYBIRD_INGEST_URL || !env.TINYBIRD_API_KEY) {
		return;
	}

	const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
	const ipHash = forwardedFor ? Buffer.from(forwardedFor).toString("base64") : "";
	const userAgent = request.headers.get("user-agent") ?? "";
	const referer = request.headers.get("referer") ?? "";

	await fetch(env.TINYBIRD_INGEST_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.TINYBIRD_API_KEY}`,
		},
		body: JSON.stringify({
			token,
			scanned_at: new Date().toISOString(),
			user_agent: userAgent,
			referer,
			ip_hash: ipHash || null,
			country: request.cf?.country ?? "",
		}),
	});
}

async function logToSupabase(request: Request, token: string, env: Env): Promise<void> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
		return;
	}

	const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
	const ipHash = forwardedFor ? Buffer.from(forwardedFor).toString("base64") : "";
	const userAgent = request.headers.get("user-agent") ?? "";
	const referer = request.headers.get("referer") ?? "";

	await fetch(`${env.SUPABASE_URL}/rest/v1/scan_events`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			apikey: env.SUPABASE_SECRET_KEY,
			Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
		},
		body: JSON.stringify({
			token,
			user_agent: userAgent,
			referer,
			ip_hash: ipHash || null,
		}),
	});
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const match = /^\/r\/([A-Za-z0-9]+)$/.exec(url.pathname);

		if (!match) {
			return jsonResponse(404, "Not Found");
		}

		const token = match[1];
		const payload = await readUpstash(token, env);
		if (!payload) {
			return jsonResponse(404, "Token not found");
		}

		if (payload.deleted_at || isExpired(payload.expires_at)) {
			return jsonResponse(410, "Token has been deleted or expired");
		}

		ctx.waitUntil(Promise.all([
			sendTinybirdLog(request, token, env),
			logToSupabase(request, token, env),
		]));

		return Response.redirect(payload.url, 302);
	},
} satisfies ExportedHandler<Env>;
