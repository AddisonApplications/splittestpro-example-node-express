// A hybrid test: the Split Test Pro pixel runs the experiment in the browser
// ("On your site") and this server reads the same assignment. The page loads
// the real pixel, waits for it to assign the visitor, then sends the pixel's
// visitor id and assignment string to /api/hybrid, which evaluates the flag
// with them and reports whether the server agrees with the pixel.
//
// The browser never calls the flags API itself (it is CORS-closed on purpose),
// and this server never records an exposure for a hybrid test: the pixel owns it.
import express from "express";
import { randomUUID } from "node:crypto";
import { esc, page } from "../lib/html.js";

export function hybridRoutes({ stp, config }) {
  const router = express.Router();

  router.get("/hybrid", (req, res) => {
    if (!config.pixelKey) {
      return res.send(page({
        title: "Hybrid test",
        body: `<p class="bad">Set <code>STP_PIXEL_KEY</code> to the workspace's public pixel key (Settings → Script &amp; API) and restart. <code>STP_PIXEL_URL</code> defaults to <code>STP_BASE_URL</code>.</p>`,
      }));
    }
    const snippet = `<script src="${esc(config.pixelScriptUrl)}" data-api-key="${esc(config.pixelKey)}" data-api-url="${esc(config.pixelUrl)}" crossorigin="anonymous"></script>`;
    res.send(page({
      title: "Hybrid test",
      head: snippet,
      body: `
<p>This page loads the pixel from <code>${esc(config.pixelScriptUrl)}</code>. A running test set to <b>On your site</b> whose URL rule matches this page assigns the visitor in the browser; the server then evaluates <code>${esc(config.flagKey)}</code> with the pixel's visitor id and assignments.</p>
<section id="hybrid"><p class="muted">Waiting for the pixel to assign this visitor…</p></section>
<script>
(function () {
  var FLAG = ${JSON.stringify(config.flagKey)};
  var out = document.getElementById("hybrid");
  var deadline = Date.now() + 15000;
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function show(html) { out.innerHTML = html; }
  function headers() {
    var stp = window.SplitTestPro || {};
    return {
      "X-STP-Visitor": (typeof stp.getVisitorId === "function" && stp.getVisitorId()) || "",
      "X-STP-Assignments": (typeof stp.getAssignments === "function" && stp.getAssignments()) || ""
    };
  }
  function tick() {
    var stp = window.SplitTestPro;
    if (stp && typeof stp.getAssignments === "function" && stp.getAssignments() !== "") return check();
    if (Date.now() > deadline) {
      return show('<p class="bad">No assignment after 15 s.</p><ul>'
        + '<li>Is a test set to <b>On your site</b> running, with a URL rule that matches this page (for example <code>contains localhost:3000/hybrid</code>)?</li>'
        + '<li>Is the pixel loading? Look for <code>experiment.js</code> in the Network tab.</li>'
        + '<li>Is <code>STP_PIXEL_KEY</code> the public key from Settings → Script &amp; API?</li></ul>');
    }
    setTimeout(tick, 100);
  }
  function check() {
    fetch("/api/hybrid", { method: "POST", headers: headers() })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function (e) { show('<p class="bad">' + esc(e) + '</p>'); });
  }
  function render(d) {
    var s = d.server || {};
    var pairs = d.pairs || {};
    var pixelVariant = s.experiment_id ? pairs[s.experiment_id] : null;
    var rows = ''
      + '<tr><th>Visitor id</th><td colspan="2"><code>' + esc(d.visitor) + '</code></td></tr>'
      + '<tr><th>Pixel assignments</th><td colspan="2"><code>' + esc(d.assignments) + '</code></td></tr>'
      + '<tr><th></th><th>Pixel</th><th>Server (SDK)</th></tr>'
      + '<tr><th>Experiment</th><td class="wrap"><code>' + esc(Object.keys(pairs).join(", ") || "—") + '</code></td><td><code>' + esc(s.experiment_id || "—") + '</code></td></tr>'
      + '<tr><th>Variant</th><td><code>' + esc(pixelVariant || "—") + '</code></td><td><code>' + esc(s.variant_id || "—") + '</code></td></tr>'
      + '<tr><th>' + esc(FLAG) + '</th><td class="muted">served by the pixel</td><td><code>' + esc(JSON.stringify(s.value)) + '</code> (' + esc(s.reason) + ')</td></tr>';
    var cls = d.verdict === "agree" ? "ok" : "bad";
    show('<p>Verdict: <b class="' + cls + '">' + esc(d.verdict) + '</b></p><div class="scroll"><table>' + rows + '</table></div>'
      + '<p><button id="buy" type="button">Buy for $49 (server conversion with assignments)</button> <span id="bought" class="muted"></span></p>');
    document.getElementById("buy").onclick = function () {
      fetch("/api/hybrid/buy", { method: "POST", headers: headers() })
        .then(function (r) { return r.json(); })
        .then(function (b) {
          document.getElementById("bought").textContent = b.eventId
            ? "Recorded conversion " + b.eventId + " — delivery shows on /events"
            : "Error: " + JSON.stringify(b);
        })
        .catch(function (e) { document.getElementById("bought").textContent = String(e); });
    };
  }
  tick();
})();
</script>
`,
    }));
  });

  router.post("/api/hybrid", async (req, res) => {
    const visitor = String(req.get("X-STP-Visitor") || "").trim();
    const assignments = String(req.get("X-STP-Assignments") || "").trim();
    const pairs = parseAssignments(assignments);
    if (!visitor) {
      return res.status(400).json({ visitor, assignments, pairs, flag: config.flagKey, server: null, verdict: "no_visitor_id" });
    }
    const flags = await stp.evaluate(visitor, [config.flagKey], assignments ? { assignments } : undefined);
    const r = flags[config.flagKey] || { value: false, reason: "error" };
    let verdict;
    if (r.reason !== "experiment") verdict = `server_not_in_experiment(${r.reason})`;
    else if (pairs[r.experiment_id] === r.variant_id) verdict = "agree";
    else verdict = "variant_mismatch";
    res.json({ visitor, assignments, pairs, flag: config.flagKey, server: r, verdict });
  });

  router.post("/api/hybrid/buy", (req, res) => {
    const visitor = String(req.get("X-STP-Visitor") || "").trim();
    const assignments = String(req.get("X-STP-Assignments") || "").trim();
    if (!visitor) return res.status(400).json({ error: "no_visitor_id" });
    const eventId = randomUUID();
    stp.recordConversion({ identity: visitor, eventType: config.goal, value: 49, currency: "USD", eventId, ...(assignments ? { assignments } : {}) });
    res.json({ eventId });
  });

  return router;
}

/** "expId:varId|expId:varId" → { expId: varId } */
export function parseAssignments(s) {
  const pairs = {};
  for (const part of String(s || "").split("|")) {
    const i = part.indexOf(":");
    if (i > 0) pairs[part.slice(0, i)] = part.slice(i + 1);
  }
  return pairs;
}
