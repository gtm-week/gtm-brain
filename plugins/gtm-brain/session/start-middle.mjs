// The chat start's middle lines, in one process instead of one node per line (a file too big for git comes first): under load each spawn took about a
// second, and the twenty of them made a chat's first GTM Brain call take 20 to 30 seconds, long enough for Codex's
// exec cell to yield and spend a whole model request waiting (measured 2026-11-18). In order: the dashboard line,
// which brain, a sharing problem, the chats and foreign-files lines, the rulebook line, the layout and owner lines,
// the question policy, today's dates, the schedule and capture notices, the rulebook rows, the answer line, a
// waiting handoff and the onboarding continuation. Each part stands alone: one that fails prints nothing.
//   node start-middle.mjs <root> <project> <work dir> <settings file, relative> <rules dir>
import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
const [root, project = "", W, settings, rulesDir = root] = process.argv.slice(2);
const P = process.env.PLUGIN_ROOT || fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const lib = u => import(new URL(`../lib/${u}`, import.meta.url));
const say = s => { if (s) console.log(s); };
const read = f => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const json = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const { host } = await lib("host.mjs");
const h = host();
let brain = null; const l = async () => brain || (brain = await lib("brain.mjs"));
const admin = async () => { try { return (await l()).readAdmin(root) || {}; } catch { return {}; } };
const agents = read(join(root, "AGENTS.md"));
const interactionPolicy = () => {
  say(`Before the first question you ask the person, read ${P}/skills/gtmb-start/references/questions.md once; not before a plain answer, and not again later.`);
  say("Call GTM Brain tools directly when the host lists them as tools. When the host exposes them only inside a code or script cell, call them there: that is the host's tool path, not a workaround. Either way a result is content parts (never stringify it).");
  process.stdout.write(read(join(P, "policies", "questions.md")) + read(join(P, "policies", "computer-use.md")));
};
const parts = [
  async () => { const b = await l(), g = b.largeUnsaved(root); if (g.length) say(b.largeNote(g, root)); },   // a file too big for git is never committed: Codex is told, to offer the shared drive
  async () => {   // the dashboard, when its server is running; in a project only its link
    const s = json(join(W, "dash.json")); let url = "";
    if (s) { try { process.kill(s.pid, 0); url = s.url + (project ? "#view=home&project=" + encodeURIComponent(project) : ""); } catch {} }
    if (!url) return;
    const mode = (await admin()).dashboard === "on-demand" ? "on-demand" : "always";
    if (project) say(`Dashboard: ${url} (the brain's own chat opens it; here give it as a link when asked).`);
    else if (process.env.GTM_BRAIN_RUN) return;
    else say(mode === "always" ? h.texts.dashboardAlways(url) : h.texts.dashboardOnDemand(url));
  },
  async () => { const company = (await admin()).company || ""; say(`brain: ${basename(root)}${company ? ` (${company})` : ""} at ${root}  ·  admin: ${settings} (always loaded)`); },
  async () => { if (/"ok": *false/.test(read(join(W, "push.json"))) || /"status": *"conflict"/.test(read(join(W, "teammates.json")))) say((await l()).syncNotice(root)); },
  async () => say(h.texts.chats()),
  async () => say(h.texts.foreign()),
  async () => { if (!h.rulebookLoaded(rulesDir)) say(h.texts.rulebook(root)); },
  async () => { const b = await l(); say(b.layoutStartLine(root)); say(b.ownerStartLine(root)); },
  async () => {   // the question policy: a rule page pointer for a rulebook from 0.35.0 on, the generated blocks' file before, the whole policy otherwise
    const loaded = !project && h.rulebookLoaded(root);
    if (loaded && /^## Rule pages/m.test(agents) && !agents.includes("<!-- generated: questions")) say("Before the first question you ask the person, read the questions rule page once (query, object rules, search questions); not before a plain answer, and not again later.");
    else if (loaded && agents.includes("<!-- generated: questions") && agents.includes("<!-- generated: computer-use")) say(`Before the first question you ask the person, read ${P}/skills/gtmb-start/references/questions.md once; not before a plain answer, and not again later.`);
    else interactionPolicy();
  },
  async () => say((await lib("dots.mjs")).datesLine()),
  async () => say((await lib("schedule.mjs")).scheduleNotice(root)),
  async () => say((await lib("capture.mjs")).captureNotice(root)),
  async () => { const d = await lib("dots.mjs"), t = d.rulebookText(root); if (t) { say(t); d.markRulebookSent(root, (await l()).readSession(root, project || null)?.session_id); } },
  async () => say("Answer the person's request using relevant saved evidence. To answer a question, call query with object answer and the question as asked: one query answer call returns everything recorded about the companies and people in the question. Never open, inspect or refresh the dashboard before an ordinary answer: its maintenance runs in the background, and open_dashboard is for when the person asks to see it. External source sync runs only when requested or by an approved schedule."),
  async () => {   // a handoff another assistant wrote by following IMPORT.md, said once per chat; the model offers, never imports by itself
    const home = process.env.GTM_BRAIN_HOME || process.env.GTM_OS_HOME || process.env.HOME;
    for (const hf of [".gtm-brain/handoff.md", ".gtm-brain/claude-export.md", ".gtm-os/handoff.md", ".gtm-os/claude-export.md"].map(f => join(home, f))) {
      if (!existsSync(hf)) continue;
      const text = read(hf), field = k => (text.match(new RegExp(`^${k}: *(.*)$`, "m")) || [])[1] || "";
      say(`HANDOFF waiting: ${hf} (by ${field("by") || "another assistant"}, confirmed: ${field("confirmed") || "unknown"}; skill gtmb-start). Offer once, in one line, to bring it in; every line is played back before it enters the brain.`);
      break;
    }
  },
  async () => say((await l()).onboardingInstruction(root, { project })),   // one persisted workflow flag drives both hook and MCP continuation
];
for (const part of parts) { try { await part(); } catch {} }
