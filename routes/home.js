// The checkout page: evaluate the flag for this user, render the variant,
// record the exposure when the value came from a running experiment, and
// record a conversion when they buy.
import express from "express";
import { randomUUID } from "node:crypto";
import { ensureIdentity, clearIdentity } from "../lib/identity.js";
import { esc, json, page } from "../lib/html.js";

export function homeRoutes({ stp, config }) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const identity = ensureIdentity(req, res);
    const flags = await stp.evaluate(identity, [config.flagKey]);
    const r = flags[config.flagKey] || { value: false, reason: "error" };

    // An exposure says "this user experienced this variant". Only a value that
    // came from a running server-side experiment is one; rollouts, kill
    // switches and failures are not. The SDK queues it and delivers in the
    // background; the returned id shows up on /events.
    let exposureId = null;
    if (r.reason === "experiment") {
      exposureId = stp.recordExposure({ identity, experimentId: r.experiment_id, variantId: r.variant_id });
    }

    const variant = r.value
      ? `<div class="box box--new"><h2>New checkout</h2><p>One-page checkout with express pay. (<code>${esc(config.flagKey)}</code> is <b>on</b> for this user.)</p></div>`
      : `<div class="box"><h2>Classic checkout</h2><p>The three-step checkout. (<code>${esc(config.flagKey)}</code> is <b>off</b> for this user.)</p></div>`;

    const exposure = exposureId
      ? `<p class="ok">Exposure recorded as event <code>${esc(exposureId)}</code> (experiment <code>${esc(r.experiment_id)}</code>, variant <code>${esc(r.variant_id)}</code>). Delivery shows on <a href="/events">Events</a>.</p>`
      : `<p class="muted">No exposure recorded: the reason is <code>${esc(r.reason)}</code>, not <code>experiment</code>.</p>`;

    res.send(page({
      title: "Checkout",
      body: `
<p>You are <code>${esc(identity)}</code> (a cookie; <a href="/reset">reset</a> to become someone new).</p>
${variant}
<h2>Evaluation</h2>
${json({ [config.flagKey]: r })}
<p class="muted">SDK: configVersion <code>${esc(stp.configVersion ?? "—")}</code>, entitled <code>${esc(String(stp.entitled))}</code>, frozen <code>${esc(String(stp.frozen))}</code>.</p>
${exposure}
<h2>Convert</h2>
<form method="post" action="/buy"><button type="submit">Buy for $49</button> <span class="muted">records a <code>${esc(config.goal)}</code> conversion for this user</span></form>
`,
    }));
  });

  router.post("/buy", express.urlencoded({ extended: false }), (req, res) => {
    const identity = ensureIdentity(req, res);
    // A stable event id makes a retried or double-submitted order count once.
    const eventId = randomUUID();
    stp.recordConversion({ identity, eventType: config.goal, value: 49, currency: "USD", eventId });
    res.send(page({
      title: "Thanks",
      body: `
<p>Recorded conversion <code>${esc(eventId)}</code> for <code>${esc(identity)}</code>, goal <code>${esc(config.goal)}</code>, $49.</p>
<p>It is delivered in the background; <a href="/events">Events</a> shows whether the API kept it (<code>recorded: true</code>) or why not.</p>
<p><a href="/">Back to checkout</a></p>
`,
    }));
  });

  router.get("/reset", (req, res) => {
    clearIdentity(res);
    res.redirect(303, "/");
  });

  return router;
}
