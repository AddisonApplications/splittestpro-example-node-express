// The raw config call, outside the SDK: proves the key, the base URL and the
// ETag / 304 contract, and shows what the SDK currently believes.
import express from "express";
import { DEFAULT_BASE_URL } from "@splittestpro/node";
import { maskKey } from "../lib/config.js";
import { esc, json, page } from "../lib/html.js";

export function debugRoutes({ stp, config }) {
  const router = express.Router();

  router.get("/debug", async (req, res) => {
    const base = config.baseUrl || DEFAULT_BASE_URL;
    const url = `${base}/api/html/flags/config`;
    const headers = { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" };

    let first = null;
    let second = null;
    let error = null;
    try {
      const r1 = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      first = { status: r1.status, etag: r1.headers.get("etag"), body: await bodyOf(r1) };
      if (first.etag) {
        const r2 = await fetch(url, { headers: { ...headers, "If-None-Match": first.etag }, signal: AbortSignal.timeout(5000) });
        second = { status: r2.status, etag: r2.headers.get("etag"), body: await bodyOf(r2) };
      }
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }

    const effective = {
      apiKey: maskKey(config.apiKey),
      baseUrl: base,
      flagKey: config.flagKey,
      goal: config.goal,
      pixelKey: config.pixelKey ? `${config.pixelKey.slice(0, 4)}…` : "(unset)",
      pixelUrl: config.pixelUrl,
      pixelScriptUrl: config.pixelScriptUrl,
      pollIntervalMs: config.pollIntervalMs,
    };

    res.send(page({
      title: "Debug",
      body: `
<h2>Effective configuration</h2>
${json(effective)}
<h2>GET ${esc(url)}</h2>
${error ? `<p class="bad">${esc(error)}</p>` : ""}
${first ? `<p>Status <b class="${first.status === 200 ? "ok" : "bad"}">${first.status}</b>, ETag <code>${esc(first.etag || "(none)")}</code></p>${json(first.body)}` : ""}
${second ? `<h2>Same request with If-None-Match</h2><p>Status <b class="${second.status === 304 ? "ok" : "bad"}">${second.status}</b> (expected 304: nothing changed)</p>` : ""}
<h2>What the SDK believes</h2>
${json({ configVersion: stp.configVersion ?? null, entitled: stp.entitled, frozen: stp.frozen })}
<p class="muted">The SDK polls the config every ${esc(config.pollIntervalMs)} ms and drops its cache when the version changes: a Kill in Settings reaches this server within that interval.</p>
`,
    }));
  });

  return router;
}

async function bodyOf(r) {
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
