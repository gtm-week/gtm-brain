// The dashboard server is detached on purpose: it has to outlive the Codex session start that
// spawned it. That makes it the test suite's job to stop the ones it causes to start, and a test
// brain can acquire one indirectly, through the session-start hook, without ever naming dash.mjs.
// An unstopped server keeps a port and file watchers for as long as the machine is up; enough of
// them and the suite stalls instead of failing, which reads like a hang rather than a leak.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after } from "node:test";

const tracked = new Map();

// Registered as the module loads, so the hook belongs to the file rather than to whichever test
// happened to create the first brain. Registering from inside a running test scopes the hook to
// that test, and every brain made afterwards outlives it.
after(stopTrackedDashboards);

// Records a brain so its dashboard is stopped when the file's tests finish. Safe for a brain that
// never started one: dash.json exists only while a server is running.
export function trackBrain(root, plugin) {
  tracked.set(root, plugin);
  return root;
}

export function stopTrackedDashboards() {
  for (const [root, plugin] of tracked) {
    if (!existsSync(join(root, "work", "dash.json"))) continue;
    try {
      execFileSync(process.execPath, [join(plugin, "server/dash.mjs"), root, "--stop"], { cwd: root, stdio: "ignore" });
    } catch {}
  }
  tracked.clear();
}
