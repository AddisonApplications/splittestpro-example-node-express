// An in-memory log of what the SDK reports in the background: `delivered`
// (an exposure or conversion reached the API; `recorded` says whether it was
// kept and, when not, why) and `error` (a failed request, with `code`).
// Without an `error` listener the SDK is silent, so this is the only place a
// QA pass can see a revoked key, a 429 or a dropped event.

export function createEventLog(stp, { capacity = 200 } = {}) {
  const items = [];
  const push = (entry) => {
    items.unshift({ at: new Date().toISOString(), ...entry });
    if (items.length > capacity) items.length = capacity;
  };
  stp.on("delivered", (ev) => push({ kind: "delivered", ...ev }));
  stp.on("error", (err) => push({ kind: "error", message: err && err.message, ...ownProps(err) }));
  return {
    list: () => items.slice(),
    clear: () => {
      items.length = 0;
    },
  };
}

function ownProps(err) {
  const out = {};
  if (!err || typeof err !== "object") return out;
  for (const k of Object.keys(err)) {
    if (k === "stack" || k === "message") continue;
    const v = err[k];
    if (v === undefined || typeof v === "function") continue;
    out[k] = v instanceof Error ? { message: v.message } : v;
  }
  return out;
}
