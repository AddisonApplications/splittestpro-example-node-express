// Tiny HTML helpers: no template engine, every dynamic value goes through esc().

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

export function json(value) {
  return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
}

export function page({ title, body, head = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Split Test Pro example</title>
${head}
<style>${CSS}</style>
</head>
<body>
<nav>
  <a href="/">Checkout</a>
  <a href="/hybrid">Hybrid</a>
  <a href="/events">Events</a>
  <a href="/debug">Debug</a>
  <a href="/reset">Reset identity</a>
</nav>
<main>
<h1>${esc(title)}</h1>
${body}
</main>
</body>
</html>
`;
}

const CSS = `
:root { color-scheme: light dark; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 820px; padding: 16px; }
nav { display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 0 16px; border-bottom: 1px solid #8884; }
nav a { text-decoration: none; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.1rem; margin-top: 28px; }
.box { border: 2px solid #8886; border-radius: 10px; padding: 16px; margin: 16px 0; }
.box--new { border-color: #16a34a; }
pre { background: #8881; padding: 12px; border-radius: 8px; overflow: auto; font-size: 13px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #8883; vertical-align: top; }
.bad { color: #dc2626; }
.ok { color: #16a34a; }
.muted { opacity: .7; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #8886; cursor: pointer; }
code { font-size: .95em; overflow-wrap: anywhere; }
.scroll { overflow-x: auto; }
.scroll td, .scroll th { white-space: nowrap; }
.scroll td.wrap { white-space: normal; min-width: 260px; }
`;
