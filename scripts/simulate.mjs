#!/usr/bin/env node
// Synthetic traffic so Results have something to show.
//
//   STP_API_KEY=stp_… node scripts/simulate.mjs --n 200
//
// Each simulated user is a fresh identity: evaluate the flag, record an
// exposure when the value came from an experiment, then convert with a
// probability that depends on the flag VALUE (the control variant of a
// server-side test carries no flag value, so it is the `false` side).
//
// Options (defaults in brackets):
//   --n <users>            [200]
//   --rate <per minute>    [300]   evaluate calls per minute; the API allows 600 per key
//   --conv-false <p>       [0.05]  conversion probability when the flag is false
//   --conv-true <p>        [0.08]  conversion probability when the flag is true
//   --flag <key>           [STP_FLAG_KEY or new-checkout]
//   --goal <event_type>    [STP_GOAL or purchase]
//   --burst                fire 700 evaluate calls at once to provoke 429 rate limiting
//                          (this spends the key's evaluate budget for the next minute — run it last)
import { SplitTestPro } from "@splittestpro/node";
import { loadConfig } from "../lib/config.js";

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();
if (config.error) {
  console.error(config.error);
  process.exit(1);
}
const flagKey = args.flag || config.flagKey;
const goal = args.goal || config.goal;
const n = int(args.n, 200);
const rate = int(args.rate, 300);
const convFalse = num(args["conv-false"], 0.05);
const convTrue = num(args["conv-true"], 0.08);
const run = Date.now().toString(36);

const stp = new SplitTestPro({
  apiKey: config.apiKey,
  ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  pollIntervalMs: config.pollIntervalMs,
  timeoutMs: 10000,
});

const tally = {
  evaluations: 0,
  byReason: {},
  byVariant: {},
  delivered: { recorded: 0, notRecorded: {} },
  errors: {},
};
stp.on("delivered", (ev) => {
  if (ev.recorded) tally.delivered.recorded += 1;
  else tally.delivered.notRecorded[ev.reason || "?"] = (tally.delivered.notRecorded[ev.reason || "?"] || 0) + 1;
});
stp.on("error", (err) => {
  tally.errors[err.code || "?"] = (tally.errors[err.code || "?"] || 0) + 1;
});

if (args.burst) {
  console.log(`burst: 700 concurrent evaluate calls for ${flagKey} (expect rate_limited errors)`);
  const results = await Promise.all(Array.from({ length: 700 }, (_, i) => stp.evaluate(`burst_${run}_${i}`, [flagKey])));
  const reasons = {};
  for (const r of results) {
    const reason = (r[flagKey] || {}).reason || "?";
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
  console.log("burst results by reason:", reasons);
  console.log("SDK errors by code:", tally.errors);
  await stp.close();
  process.exit(0);
}

console.log(`simulating ${n} users at ${rate}/min against ${config.baseUrl || "the SDK default"} (flag ${flagKey}, goal ${goal})`);
const interval = 60000 / rate;
const start = Date.now();
for (let i = 0; i < n; i++) {
  const due = start + i * interval;
  const wait = due - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const identity = `sim_${run}_${i}`;
  const flags = await stp.evaluate(identity, [flagKey]);
  const r = flags[flagKey] || { value: false, reason: "error" };
  tally.evaluations += 1;
  tally.byReason[r.reason] = (tally.byReason[r.reason] || 0) + 1;

  const bucket = r.reason === "experiment" ? r.variant_id : r.reason;
  const row = (tally.byVariant[bucket] ||= { value: r.value, users: 0, exposures: 0, conversions: 0 });
  row.users += 1;
  if (r.reason === "experiment") {
    stp.recordExposure({ identity, experimentId: r.experiment_id, variantId: r.variant_id });
    row.exposures += 1;
  }
  if (Math.random() < (r.value ? convTrue : convFalse)) {
    stp.recordConversion({ identity, eventType: goal, value: 49, currency: "USD" });
    row.conversions += 1;
  }
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${n}`);
}

await stp.close();
console.log("\nevaluations by reason:", tally.byReason);
console.log("\nby variant (or reason when not in an experiment):");
console.table(tally.byVariant);
console.log("delivered:", tally.delivered);
console.log("SDK errors by code:", tally.errors);
console.log("\nOpen the experiment's Results tab, pick Devices → Server and click Refresh.");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}
function int(v, d) { const x = parseInt(v, 10); return Number.isFinite(x) && x > 0 ? x : d; }
function num(v, d) { const x = parseFloat(v); return Number.isFinite(x) && x >= 0 && x <= 1 ? x : d; }
