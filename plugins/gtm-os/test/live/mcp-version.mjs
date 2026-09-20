// Which GTM OS is actually answering: speaks MCP to a plugin root and reports what it says.
//   node plugins/gtm-os/test/live/mcp-version.mjs                       this checkout
//   node plugins/gtm-os/test/live/mcp-version.mjs ~/.codex/plugins/cache/gtm-os/gtm-os/0.6.0
// The version comes from the server's own initialize reply, so it is the running code talking,
// not a file someone read. Codex starts the same server the same way (.mcp.json).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import fs from "node:fs";

const root = process.argv[2] || fileURLToPath(new URL("../../", import.meta.url));
const child = spawn(process.execPath, [join(root, "server", "server.mjs")], { cwd: root, stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, GTM_OS_NO_OPEN: "1" } });
const pending = new Map();
let id = 0;
const call = (method, params = {}) => new Promise(done => { pending.set(++id, done); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
createInterface({ input: child.stdout }).on("line", line => { let m; try { m = JSON.parse(line); } catch { return; } const done = pending.get(m.id); if (done) { pending.delete(m.id); done(m.result || m.error); } });

const hello = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-version", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const { tools = [] } = await call("tools/list");
const engine = (() => { try { return JSON.parse(fs.readFileSync(join(root, "vendor", "allethic", "VERSION.json"), "utf8")).commit.slice(0, 12); } catch { return null; } })();
console.log(`root     ${root}`);
console.log(`server   GTM OS ${hello?.serverInfo?.version ?? "no version in initialize"}`);
console.log(`tools    ${tools.length}: ${tools.map(t => t.name).join(", ")}`);
console.log(`allethic ${engine ? `vendored, commit ${engine}` : "not bundled in this version"}`);
child.stdin.end();
