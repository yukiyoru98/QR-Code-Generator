"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type JsonValue = Record<string, unknown>;

export default function Home() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [createUrl, setCreateUrl] = useState("https://example.com");
  const [createExpiresAt, setCreateExpiresAt] = useState("");

  const [token, setToken] = useState("");
  const [updateUrl, setUpdateUrl] = useState("https://new-url.com");
  const [updateExpiresAt, setUpdateExpiresAt] = useState("");

  const [createResult, setCreateResult] = useState<JsonValue | null>(null);
  const [infoResult, setInfoResult] = useState<JsonValue | null>(null);
  const [updateResult, setUpdateResult] = useState<JsonValue | null>(null);
  const [deleteResult, setDeleteResult] = useState<JsonValue | null>(null);
  const [analyticsResult, setAnalyticsResult] = useState<JsonValue | null>(null);

  const tokenFromCreate = useMemo(() => {
    const value = createResult?.token;
    return typeof value === "string" ? value : "";
  }, [createResult]);

  const resolvedToken = token.trim() || tokenFromCreate;
  const qrImageUrl = resolvedToken ? `/api/qr/${resolvedToken}/image` : "";
  const redirectUrl = resolvedToken ? `/r/${resolvedToken}` : "";

  async function parseResponse(response: Response): Promise<JsonValue> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return { raw: text };
    }
  }

  async function requestJson(path: string, init?: RequestInit): Promise<JsonValue> {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const body = await parseResponse(response);
    if (!response.ok) {
      const message =
        typeof body.error === "string"
          ? body.error
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  async function runAction<T>(action: string, fn: () => Promise<T>) {
    setLoading(action);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, unknown> = { url: createUrl };
    if (createExpiresAt.trim()) payload.expires_at = createExpiresAt;

    const result = await runAction("create", () =>
      requestJson("/api/qr/create", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    if (!result) return;
    setCreateResult(result as JsonValue);

    const nextToken = (result as JsonValue).token;
    if (typeof nextToken === "string") {
      setToken(nextToken);
    }
  }

  async function onGetInfo() {
    if (!resolvedToken) {
      setError("Enter a token or create a QR first.");
      return;
    }

    const result = await runAction("info", () => requestJson(`/api/qr/${resolvedToken}`));
    if (result) setInfoResult(result as JsonValue);
  }

  async function onUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedToken) {
      setError("Enter a token or create a QR first.");
      return;
    }

    const payload: Record<string, unknown> = {};
    if (updateUrl.trim()) payload.url = updateUrl;
    if (updateExpiresAt.trim()) payload.expires_at = updateExpiresAt;

    if (Object.keys(payload).length === 0) {
      setError("Provide url or expires_at to update.");
      return;
    }

    const result = await runAction("update", () =>
      requestJson(`/api/qr/${resolvedToken}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );

    if (result) setUpdateResult(result as JsonValue);
  }

  async function onDelete() {
    if (!resolvedToken) {
      setError("Enter a token or create a QR first.");
      return;
    }

    const result = await runAction("delete", () =>
      requestJson(`/api/qr/${resolvedToken}`, {
        method: "DELETE",
      }),
    );

    if (result) setDeleteResult(result as JsonValue);
  }

  async function onAnalytics() {
    if (!resolvedToken) {
      setError("Enter a token or create a QR first.");
      return;
    }

    const result = await runAction("analytics", () =>
      requestJson(`/api/qr/${resolvedToken}/analytics`),
    );

    if (result) setAnalyticsResult(result as JsonValue);
  }

  return (
    <div className="flex min-h-screen w-full justify-center bg-slate-100 px-4 py-10 text-slate-900">
      <main className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-semibold">QR Link Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create, update, delete, and inspect analytics for dynamic QR links.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <form onSubmit={onCreate} className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-medium">Create QR</h2>
            <label className="mt-3 block text-sm">Target URL</label>
            <input
              value={createUrl}
              onChange={(e) => setCreateUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://example.com"
              required
            />

            <label className="mt-3 block text-sm">Expires At (optional ISO timestamp)</label>
            <input
              value={createExpiresAt}
              onChange={(e) => setCreateExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="2027-01-01T00:00:00.000Z"
            />

            <button
              type="submit"
              disabled={loading === "create"}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading === "create" ? "Creating..." : "Create"}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-medium">Token Context</h2>
            <label className="mt-3 block text-sm">Working Token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Paste token or create one"
            />
            <p className="mt-2 text-xs text-slate-500">
              If blank, the newest created token is used automatically.
            </p>
            {resolvedToken ? (
              <div className="mt-3 text-xs text-slate-700">
                <div>Resolved token: {resolvedToken}</div>
                <div className="mt-1">Redirect path: {redirectUrl}</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <form onSubmit={onUpdate} className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-medium">Update Token</h2>
            <label className="mt-3 block text-sm">New URL (optional)</label>
            <input
              value={updateUrl}
              onChange={(e) => setUpdateUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://new-url.com"
            />

            <label className="mt-3 block text-sm">New Expires At (optional ISO timestamp)</label>
            <input
              value={updateExpiresAt}
              onChange={(e) => setUpdateExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="2027-01-01T00:00:00.000Z"
            />

            <button
              type="submit"
              disabled={loading === "update"}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading === "update" ? "Updating..." : "Update"}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-medium">Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onGetInfo}
                disabled={loading === "info"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
              >
                {loading === "info" ? "Loading..." : "Get Info"}
              </button>

              <button
                type="button"
                onClick={onAnalytics}
                disabled={loading === "analytics"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
              >
                {loading === "analytics" ? "Loading..." : "Get Analytics"}
              </button>

              <button
                type="button"
                onClick={onDelete}
                disabled={loading === "delete"}
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 disabled:opacity-60"
              >
                {loading === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>

            {qrImageUrl ? (
              <div className="mt-4">
                <p className="mb-2 text-xs text-slate-500">QR preview</p>
                <Image
                  src={qrImageUrl}
                  alt="QR code"
                  width={160}
                  height={160}
                  unoptimized
                  className="h-40 w-40 rounded-md border border-slate-200"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <ResultCard title="Create Result" value={createResult} />
          <ResultCard title="Info Result" value={infoResult} />
          <ResultCard title="Update Result" value={updateResult} />
          <ResultCard title="Delete Result" value={deleteResult} />
          <ResultCard title="Analytics Result" value={analyticsResult} />
        </section>
      </main>
    </div>
  );
}

function ResultCard({ title, value }: { title: string; value: JsonValue | null }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
        {value ? JSON.stringify(value, null, 2) : "No data"}
      </pre>
    </div>
  );
}
