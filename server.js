// Split Test Pro server-side testing, from an Express app.
//
//   STP_API_KEY=stp_… npm start          (defaults to production)
//   STP_BASE_URL=https://app-staging.splittestpro.com STP_API_KEY=stp_… npm start
//
// One SDK client per process: its flag-config cache and event queue live on
// the instance. See README.md for every variable and route.
import express from "express";
import { SplitTestPro } from "@splittestpro/node";
import { loadConfig } from "./lib/config.js";
import { createEventLog } from "./lib/events.js";
import { homeRoutes } from "./routes/home.js";
import { hybridRoutes } from "./routes/hybrid.js";
import { eventsRoutes } from "./routes/events.js";
import { debugRoutes } from "./routes/debug.js";

const config = loadConfig();
if (config.error) {
  console.error(config.error);
  process.exit(1);
}

const stp = new SplitTestPro({
  apiKey: config.apiKey,
  ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  pollIntervalMs: config.pollIntervalMs,
});
const events = createEventLog(stp);
stp.on("error", (err) => console.warn("splittestpro:", err.code, err.message));

const app = express();
app.disable("x-powered-by");
app.use(homeRoutes({ stp, config }));
app.use(hybridRoutes({ stp, config }));
app.use(eventsRoutes({ events }));
app.use(debugRoutes({ stp, config }));

const server = app.listen(config.port, config.host, () => {
  // Exactly this line: tests/unit/examples_node_express.test.mjs parses it.
  console.log(`listening on http://${config.host}:${server.address().port}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: closing — delivering queued events`);
  server.close();
  try {
    await stp.close();
  } catch (e) {
    console.warn("close:", e && e.message ? e.message : e);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
