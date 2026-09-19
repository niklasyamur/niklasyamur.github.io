#!/usr/bin/env node
// fanwall.mjs: admin helper for the wedding Fan Wall (Apps Script backend v15). Node 18+, no deps.
// Usage: list | hide <id> | show <id> | delete <id> | retry <id> | style <text...> | style --clear
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const EXEC = process.env.FANWALL_EXEC || "https://script.google.com/macros/s/AKfycbwSbbUZSqiAoyzUXrqjtIgqUJAZ2JI24D_mJY1w7rQAxJUuqhUTdeybOg5icuRp-n-3/exec";
const PUB = "70f65d43437f";
const TZ = process.env.FANWALL_TZ || "Europe/London";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (msg, code = 2) => { console.error("ERROR " + msg); process.exit(code); };
function key() {
  const env = (process.env.FANWALL_ADMIN_KEY || "").trim();
  if (env) return env;
  try { const k = readFileSync(join(HERE, "admin.key"), "utf8").trim(); if (k) return k; } catch {}
  return fail("admin key missing. Ask the owner for it and save it to " + join(HERE, "admin.key"), 3);
}
async function call(url, body, ms = 40000) {
  const opt = { redirect: "follow", signal: AbortSignal.timeout(ms) };
  if (body !== undefined) Object.assign(opt, { method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "text/plain;charset=utf-8" } });
  const text = await (await fetch(url, opt)).text();
  let data;
  try { data = JSON.parse(text); } catch {
    return fail("non JSON reply (the action may still have been applied, run list before repeating): "
      + text.slice(0, 120).replace(/\s+/g, " "));
  }
  if (!data.ok) return fail("backend says " + (data.error || "unknown error"), 1);
  return data;
}
const hhmm = (ts) => {
  const d = new Date(typeof ts === "number" || /^\d+$/.test(ts) ? Number(ts) : ts);
  return isNaN(d) ? String(ts) : d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
};
const post = (body) => call(EXEC, { a: key(), ...body });
const needId = (id) => id || fail("missing id", 2);
const [cmd, ...rest] = process.argv.slice(2);
const id = rest[0];
let out;
switch (cmd) {
  case "list": {
    const d = await call(`${EXEC}?a=${encodeURIComponent(key())}&t=admin`);
    console.log(`Fan Wall v${d.version} | ${d.total} rows | style: ${d.style || "(none)"}`);
    for (const r of d.rows || []) console.log([hhmm(r.ts), r.name, r.vote, r.hidden ? "HIDDEN" : "shown",
      r.aiStatus || "", r.id, r.note || ""].join(" | "));
    process.exit(0);
  }
  case "hide": out = await post({ id: needId(id), hidden: true }); break;
  case "show": out = await post({ id: needId(id), hidden: false }); break;
  case "delete": out = await post({ id: needId(id), discard: true }); break;
  case "retry": out = await call(`${EXEC}?k=${PUB}&t=edit&id=${encodeURIComponent(needId(id))}`, undefined, 150000); break;
  case "style": out = await post({ style: rest[0] === "--clear" ? "" : rest.join(" ").slice(0, 300) }); break;
  default: fail("usage: list | hide <id> | show <id> | delete <id> | retry <id> | style <text...> | style --clear", 2);
}
console.log(JSON.stringify(out));
