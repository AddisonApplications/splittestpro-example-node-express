// Configuration from the environment. Only STP_API_KEY is required; everything
// else has a default that matches the SDK's own. The key is never logged in
// full: maskKey() is what the debug page shows.

const DEFAULT_PIXEL_URL = "https://app.splittestpro.com";

export function loadConfig(env = process.env) {
  const apiKey = (env.STP_API_KEY || "").trim();
  if (!apiKey) {
    return {
      error:
        "STP_API_KEY is not set. Create a server API key in Settings → API keys, " +
        "export it in this shell (never commit it) and start again.",
    };
  }
  // null → the SDK's production default (https://app.splittestpro.com)
  const baseUrl = trimSlash(env.STP_BASE_URL || "") || null;
  const pixelUrl = trimSlash(env.STP_PIXEL_URL || "") || baseUrl || DEFAULT_PIXEL_URL;
  return {
    apiKey,
    baseUrl,
    flagKey: env.STP_FLAG_KEY || "new-checkout",
    goal: env.STP_GOAL || "purchase",
    pixelKey: (env.STP_PIXEL_KEY || "").trim(),
    pixelUrl,
    pixelScriptUrl: env.STP_PIXEL_SCRIPT_URL || `${pixelUrl}/experiment.js`,
    pollIntervalMs: positiveInt(env.STP_POLL_MS, 30000),
    port: portOf(env.PORT),
    host: env.HOST || "127.0.0.1",
  };
}

/** `stp_<key id>_…` — the shape Settings → API keys shows for a stored key. */
export function maskKey(key) {
  const m = /^stp_([^_]+)_/.exec(key || "");
  return m ? `stp_${m[1]}_…` : "stp_…";
}

function trimSlash(s) {
  return String(s).trim().replace(/\/+$/, "");
}

function positiveInt(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function portOf(v) {
  if (v === undefined || v === "") return 3000;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : 3000;
}
