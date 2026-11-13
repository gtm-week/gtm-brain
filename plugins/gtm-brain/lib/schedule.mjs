/* Is anything keeping the summaries current between chats? A scheduled run (a Codex Scheduled task with
   by: schedule, scheduled-run.sh or daily-run.mjs) always commits "scheduled: compile ..." or a compile
   "by schedule", so the brain's own git history says whether one runs, whatever started it. Artur's ICP
   summary was not compiled after 2026-10-15 and nothing said so (GTM Week sync, 2026-11-11). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { today } from "./dots.mjs";
import { activeContexts } from "./brain.mjs";
import { host } from "./host.mjs";

const git = (root, ...a) => { try { return execFileSync("git", ["--no-optional-locks", "-C", root, ...a], { encoding: "utf8", stdio: "pipe" }).trim(); } catch { return ""; } };
const DAY = 864e5;
export const SCHEDULE_PROMPT = "Run the gtm-brain-sync skill as the scheduled run: compile every context whose summary is behind with by: schedule, render the dashboard. Do nothing else.";

/* The chat-start line, or "": only when a summary has been behind for more than 2 days (each save starts
   a background compile, so a working brain is never behind that long) and no scheduled run saved anything
   in the last 8 days; at most once a week. */
export function scheduleNotice(root, now = today()) {
  if (!host().scheduledTasks) return "";
  const behind = activeContexts(root).filter(c => c.stale && !c.manualEdit?.blocked).map(c => ({ c, since: c.compiledAt || c.lastMemory }))
    .filter(x => x.since && now - new Date(x.since) > 2 * DAY);
  if (!behind.length) return "";
  const last = git(root, "log", "-1", "-E", "--format=%cs", "--grep=^scheduled: ", "--grep=by schedule\\)?$");
  const days = last ? Math.floor((now - new Date(`${last}T00:00:00`)) / DAY) : null;
  if (days !== null && days <= 8) return "";
  const memo = join(root, "work", "schedule-notice.json");
  try { if (now - new Date(JSON.parse(readFileSync(memo, "utf8")).at) < 7 * DAY) return ""; } catch {}
  try { if (!existsSync(join(root, "work"))) mkdirSync(join(root, "work")); writeFileSync(memo, JSON.stringify({ at: now.toISOString() }) + "\n"); } catch {}
  const what = behind.map(({ c }) => `${c.title || c.slug} ${c.compiledAt ? `(last compiled ${c.compiledAt.slice(0, 10)})` : "(never compiled)"}`).join(", ");
  const why = last ? `the weekly summary run last ran on ${last}` : "no weekly summary run is set up";
  const where = host().nativeQuestions?.() ? "in Codex's question box (request_user_input)" : "as plain chat text with the two numbered options, then end the turn";
  return `Summaries behind: ${what}; ${why}. After answering the person's request, ask this once, ${where}, and do nothing about it before the answer: "These summaries are out of date: ${what}, because ${why}. What should I do?" Options: 1) Compile them now and set up the weekly run (recommended) 2) Only compile them now. On 1 or 2, run GTM_BRAIN_COMPILE_DELAY=0 bash "${new URL("../scripts/gtm-brain-compile/background-compile.sh", import.meta.url).pathname}" "${root}" and say the summaries are updating. On 1, also give these steps: in the Codex app, this project, Scheduled tasks, new task, "run in the local project", weekly Sunday 20:00, prompt "${SCHEDULE_PROMPT}"${last ? "; first open Scheduled tasks and check the existing task's last run" : ""}. Never create or change a scheduled task yourself.`;
}
