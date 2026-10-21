// What the SDK delivered (and whether the API kept it) and what failed.
import express from "express";
import { esc, page } from "../lib/html.js";

export function eventsRoutes({ events }) {
  const router = express.Router();

  router.get("/events", (req, res) => {
    const list = events.list();
    if (req.query.format === "json") return res.json(list);

    const rows = list.map((e) => {
      const bad = e.kind === "error" || e.recorded === false;
      const what = e.kind === "delivered"
        ? `${esc(e.type || "")} <code>${esc(e.eventId || "")}</code>`
        : `<code>${esc(e.code || "")}</code>${e.eventId ? ` <code>${esc(e.eventId)}</code>` : ""}`;
      const outcome = e.kind === "delivered"
        ? (e.recorded ? "recorded" : `not recorded: ${esc(e.reason || "")}`)
        : esc(e.message || "");
      return `<tr class="${bad ? "bad" : ""}"><td class="muted">${esc(e.at)}</td><td>${esc(e.kind)}</td><td>${what}</td><td class="wrap">${outcome}</td></tr>`;
    }).join("");

    res.send(page({
      title: "Events",
      body: `
<p>The last ${list.length} things the SDK reported, newest first. <span class="bad">Red</span> rows are failures or events the API did not keep. <a href="/events?format=json">JSON</a></p>
<div class="scroll"><table><tr><th>When</th><th>Kind</th><th>What</th><th>Outcome</th></tr>${rows || '<tr><td colspan="4" class="muted">Nothing yet. Load the checkout or buy something.</td></tr>'}</table></div>
`,
    }));
  });

  return router;
}
