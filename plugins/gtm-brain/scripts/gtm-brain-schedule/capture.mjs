#!/usr/bin/env node
// The nightly capture pass (lib/capture.mjs): outcomes said in this brain's chats and never saved.
//   node capture.mjs <brain> --run [--by <handle>]   one pass now, in the foreground (the scheduled run)
//   node capture.mjs <brain> --start                 one pass in the background (capture_chats mode run)
//   node capture.mjs <brain> --undo [--pass <id>]     withdraw the notes the chat start listed (or one pass's)
//   node capture.mjs <brain> --status                 the heartbeat and the settings
//   node capture.mjs <brain> --off | --on            switch it off or on for this machine
//   node capture.mjs <brain> --cap <tokens> [--chat-cap <tokens>]   the input caps per pass and per chat
// Exit 0 when the pass ran or had nothing to do, 1 when it failed (the reason is in work/capture.json).
import { resolve } from "node:path";
import * as capture from "../../lib/capture.mjs";
import { readAdmin } from "../../lib/brain.mjs";

const args = process.argv.slice(2), root = resolve(args[0] && !args[0].startsWith("--") ? args.shift() : ".");
const flag = f => args.includes(f), value = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!readAdmin(root)) { console.error(`not a brain: ${root}`); process.exit(2); }
try {
  if (flag("--off") || flag("--on") || value("--cap") !== undefined || value("--chat-cap") !== undefined)
    capture.setCapture(root, { ...(flag("--off") ? { on: false } : flag("--on") ? { on: true } : {}), cap: value("--cap"), chat_cap: value("--chat-cap") });
  if (flag("--run")) {
    const r = await capture.runPass(root, { by: value("--by") });
    console.log(r.text); process.exitCode = r.result === "failed" ? 1 : 0;
  } else if (flag("--start")) console.log(capture.startPass(root));
  else if (flag("--undo")) console.log(capture.undoCaptured(root, { by: value("--by"), pass: value("--pass") }).text);
  else console.log(capture.statusText(root));
} catch (e) { console.error(e.message); process.exitCode = 1; }
