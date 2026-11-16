#!/usr/bin/env node
// The background push lib.commit starts: it pushes HEAD and records the real outcome in work/push.json,
// so a note reads "not shared yet" until a push has actually succeeded. Usage: push-runner.mjs <root> <remote>
import { spawnSync } from "node:child_process";
import { recordPush, PUSH } from "./brain.mjs";

const [root, remote] = process.argv.slice(2);
if (root && remote) {
  const r = spawnSync("git", ["-C", root, ...PUSH, remote, "HEAD"], { encoding: "utf8", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const ok = r.status === 0;
  recordPush(root, { ok, remote, error: ok ? "" : String(r.error?.message || r.stderr || `exit ${r.status}`) });
}
