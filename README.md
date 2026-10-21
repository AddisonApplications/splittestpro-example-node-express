# Split Test Pro — Node / Express example

A small Express app that uses [Split Test Pro](https://splittestpro.com) server-side testing the way a backend does: it evaluates a feature flag for each user with [`@splittestpro/node`](https://www.npmjs.com/package/@splittestpro/node), renders the matching checkout, records exposures and conversions, and runs a hybrid test with the HTML pixel.

Docs: [Server-Side Testing](https://splittestpro.com/documentation/server-side-testing/) · [Node SDK & Hybrid Tests](https://splittestpro.com/documentation/node-sdk-and-hybrid-tests/) · [Evaluation API](https://splittestpro.com/documentation/evaluation-api/)

## Requirements

- Node 18 or later.
- A Split Test Pro workspace on a paid plan (server-side testing is part of every paid plan) with a server API key from **Settings → API keys**.

## Setup

```bash
git clone https://github.com/AddisonApplications/splittestpro-example-node-express.git
cd splittestpro-example-node-express
npm ci
export STP_API_KEY=stp_…        # shown once, when the key is created; never commit it
npm start                       # http://127.0.0.1:3000
```

The app reads its configuration from the environment only. A local `.env` file is gitignored if you keep one, but nothing loads it for you.

| Variable | Default | What it is |
| --- | --- | --- |
| `STP_API_KEY` | required | A server API key (`stp_<key id>_<secret>`). |
| `STP_BASE_URL` | `https://app.splittestpro.com` | Where the API lives. Leave it unless Split Test Pro support tells you otherwise. |
| `STP_FLAG_KEY` | `new-checkout` | The flag the checkout branches on. Create it in **Settings → Feature flags**. |
| `STP_GOAL` | `purchase` | The conversion's `event_type`. It must be a goal selected on the experiment, or Results never show it. |
| `STP_PIXEL_KEY` | unset | The workspace's public pixel key (**Settings → Script & API**). Only `/hybrid` needs it. |
| `STP_PIXEL_URL` | `STP_BASE_URL` | The pixel's `data-api-url`. |
| `STP_PIXEL_SCRIPT_URL` | `STP_PIXEL_URL` + `/experiment.js` | Where the pixel script is served. Only needed when it differs from the API host. |
| `STP_POLL_MS` | `30000` | How often the SDK checks the flag config. Shorten it to watch a Kill propagate. |
| `PORT`, `HOST` | `3000`, `127.0.0.1` | Where to listen. `PORT=0` picks a free port. |

## What the app does

| Route | What happens |
| --- | --- |
| `GET /` | Reads (or mints) an opaque user id from a cookie, evaluates the flag for it and renders the **new** or **classic** checkout. When the value came from a running server-side experiment (`reason: "experiment"`) it records an exposure; a rollout, a kill switch or a failure records nothing. Shows the raw evaluation and what the SDK believes (`configVersion`, `entitled`, `frozen`). |
| `POST /buy` | Records a `purchase` conversion (value 49 USD) for the same user with a fresh event id, so a double submit would count once. |
| `GET /reset` | Drops the cookie: the next request is a new user. |
| `GET /hybrid` | Loads the real pixel. Once the pixel has assigned the visitor, the page posts the pixel's visitor id and assignment string to `/api/hybrid`, which evaluates the flag with them and answers whether the server **agrees** with the pixel. A Buy button records a conversion with the same assignments. No exposure is recorded here: for a test that runs on your site the pixel owns it. |
| `GET /events` | The last 200 things the SDK reported: each delivered exposure or conversion with `recorded: true` or the reason it was not kept (`duplicate`, `not_running`, `frozen`, `unassigned`), and every failure with its `code` (`invalid_key`, `rate_limited`, `timeout`, `pixel_owned` when `/` recorded an exposure for a test that runs on your site, …). `?format=json` for the raw list. |
| `GET /debug` | Calls `GET /api/html/flags/config` outside the SDK with your key, then again with `If-None-Match`, and shows both answers (200 with an ETag, then 304) next to the SDK's view and the effective configuration with the key masked. |

The browser never talks to the flags API: that API is closed to browsers on purpose, and the key stays on the server.

## Scripts

- `npm run simulate -- --n 200` sends 200 synthetic users through evaluate → exposure → conversion, paced under the per-key rate limit, and prints a tally by variant. `--conv-false` / `--conv-true` set the conversion probability by flag value; `--burst` fires 700 evaluate calls at once to show the API's `429` and the SDK's `rate_limited` handling (it spends the key's evaluate budget for a minute, so run it last). Then open the experiment's Results tab, pick **Devices → Server** and click **Refresh**.
- `npm run rest` walks the REST API with curl: config with its ETag and the 304 on a conditional request, evaluate, the `401` for a bad key and for a key in the query string, the `400` for a bad identity, the `409 pixel_owned` for an exposure on a test that runs on your site (set `STP_CLIENT_EXPERIMENT_ID` and `STP_CLIENT_VARIANT_ID`), and a duplicate conversion.

## License

MIT, see `LICENSE`. Questions or problems: open an issue on this repository.
