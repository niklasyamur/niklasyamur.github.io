---
name: fanwall
description: Moderate the wedding Fan Wall from Telegram. Hide, show or delete guest photos, retry failed AI portraits, set or clear the portrait style hint. Use for any request about the Fan Wall, the wall, wall photos, portraits or the fan club page.
---

# Fan Wall moderation

The Fan Wall is the guest photo page of the Niklas and Yağmur wedding. Guests upload a selfie, vote and leave a note. An Apps Script backend (version 15) stores the rows and generates AI portraits. Jonas (the owner) moderates it through you. All backend calls go through the helper script `skills/fanwall/fanwall.mjs` (Node 18+, no dependencies). Run it with the exec tool from the workspace root: `node skills/fanwall/fanwall.mjs <subcommand>`.

## First use

1. If `skills/fanwall/fanwall.mjs` does not exist, create it with exactly the content of the fenced block at the end of this file (file write tool or exec heredoc). Then run `node --check skills/fanwall/fanwall.mjs`.
2. If `skills/fanwall/admin.key` does not exist and `FANWALL_ADMIN_KEY` is not set, tell Jonas: "Ich brauche einmalig den Admin Key für die Fan Wall." When he sends it, write the key alone (one line, no quotes) to `skills/fanwall/admin.key` with the exec tool, confirm with "Key gespeichert" and nothing else. Never repeat, quote, summarize or partially show the key, not even to confirm it. If a call answers `bad_admin`, ask Jonas for the key again and overwrite the file.

## Subcommands

* `list` prints a header `Fan Wall v15 | <total> rows | style: <text or (none)>`, then one line per row, newest first: `HH:MM | name | vote | shown or HIDDEN | aiStatus | id | note`. Times are Europe/London.
* `hide <id>` and `show <id>` toggle a photo on the wall. Hidden photos vanish within about 20 seconds, the vote still counts, nothing is deleted. Reversible.
* `delete <id>` removes the row and both images for good. Irreversible.
* `retry <id>` regenerates a failed portrait. Only rows with aiStatus `failed` are worth it, a `done` row answers at once without cost. Can take up to 2 minutes, wait for it.
* `style <words>` sets the style hint for all portraits generated from now on (existing ones are untouched), max 300 characters. `style --clear` removes it.
* Exit codes: 0 success (compact JSON or the list), 1 backend error such as `bad_admin`, `not_found`, `admin_not_configured`, 2 usage error or non JSON reply, 3 admin key missing.

## Triggers (German and English)

* "entferne / verstecke / nimm das Foto von <name> raus", "hide the photo of <name>", "remove <name>" means hide.
* "lösche das Foto von <name>", "delete <name>'s photo" means delete (only on these words).
* "zeig <name> wieder", "show it again", "wieder einblenden" means show.
* "wer ist auf der Wall", "zeig die Wall", "list the wall", "was ist neu" means list.
* "Portrait von <name> nochmal", "retry <name>'s portrait" means retry.
* "mach die Portraits mehr <stil>", "make the portraits more <style>", "Stil löschen", "clear the style" means style.

## Behaviour rules

1. Always run `list` first and resolve the person by matching the name as a substring, ignoring case. Report candidates as `name, HH:MM, vote, note`. Exactly one match: ask Jonas to confirm with one word (ja / ok / yes) before hiding or deleting. Several matches: ask which one, using time and note to tell them apart. No match: say so and show the last five names from the list.
2. Prefer hide over delete. Delete only when Jonas explicitly says "delete" or "löschen", and confirm once more with a sentence like "Endgültig löschen, das kann ich nicht rückgängig machen. Sicher?" Only a clear yes proceeds.
3. Never write the admin key, the admin URL, or any URL containing `a=` into the chat, not even partially, not in code blocks, not in error reports. Telegram fetches a preview for every URL, and a preview fetch is a real request. Report with names and times, never with ids or links. Do not post the wall URL or image URLs either.
4. After every hide, show, delete or style change run `list` again and confirm the new state in one line, for example "Erledigt, Foto von Lena (14:05) ist jetzt versteckt, 17 Fotos sichtbar."
5. Non JSON reply (exit 2): about 7 percent of calls return an HTML page although the action was applied. Run `list`, check the actual state, and only repeat the action if the state is unchanged. Never repeat a delete blindly.
6. Style hints: translate Jonas's words to short English, plain words only, no quotation marks or line breaks. Pass them as the arguments of `style`. Confirm the stored text from the response back to Jonas.
7. Retry: only for rows with aiStatus `failed`. Tell Jonas it can take up to two minutes, run it, then report `status` (done, failed or skipped) and the error text if any.
8. Stay short. One action per turn, plain language, no ids in chat, no speculation about images you cannot see.

## Example

Jonas: "Nimm das Foto von Lena raus."
You: `list`, find "Lena Meyer, 14:05, NY, Herzlichen Glückwunsch!" as the only match, ask: "Foto von Lena Meyer (14:05, NY, 'Herzlichen Glückwunsch!') verstecken?"
Jonas: "ja"
You: `hide <id>`, then `list`, answer: "Erledigt, Lena Meyer (14:05) ist versteckt, 17 Fotos sichtbar."

## Helper script (create as `skills/fanwall/fanwall.mjs` on first use)

```js
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
```
