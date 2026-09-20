#!/usr/bin/env node
// Record the Codex chat this brain was opened in: the hook's JSON on stdin, lib.writeSession.
// GTM_OS_RUN set: a background, scheduled or dashboard run; its thread goes to lib.recordRunThread.
//   printf '%s' "$hook_json" | node session.mjs /path/to/brain [project]
const lib = await import(new URL("../lib/brain.mjs", import.meta.url));
let input = ""; for await (const c of process.stdin) input += c;
// A separate run (GTM_OS_RUN) is not the person's chat: it records its thread elsewhere, never here.
if (process.env.GTM_OS_RUN) lib.recordRunThread(process.argv[2] || ".", process.env.GTM_OS_RUN, input);
else lib.writeSession(process.argv[2] || ".", input, process.argv[3] || null);
