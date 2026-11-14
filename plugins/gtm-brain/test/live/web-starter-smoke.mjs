#!/usr/bin/env node
// Opt-in end-to-end acceptance test. All company edits live in a new scratch brain.
// Installs the unchanged lockfile and Chromium; never creates a remote or deploys.
// node plugins/gtm-brain/test/live/web-starter-smoke.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyBundledStarter, verifyPreparedStarter, readStarterProject } from "../../lib/web-starter.mjs";
import { stopBrainWatcher } from "../../lib/brain.mjs";

const plugin = fileURLToPath(new URL("../../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "gtm-web-starter-smoke-"));
const brain = join(scratch, "company"), project = join(brain, "website"); mkdirSync(brain);
const log = openSync(join(scratch, "commands.log"), "a");
const env = { ...process.env, CODEX_HOME: join(scratch, "profile"), PLUGIN_ROOT: plugin,
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_HOOK_CHECK: "1", GTM_BRAIN_NO_VERSION_CHECK: "1",
  GIT_AUTHOR_NAME: "Starter Smoke", GIT_AUTHOR_EMAIL: "smoke@example.invalid", GIT_COMMITTER_NAME: "Starter Smoke", GIT_COMMITTER_EMAIL: "smoke@example.invalid" };
const run = (command, args, cwd = project, extra = {}) => {
  console.log(`${command} ${args.join(" ")}`);
  const r = spawnSync(command, args, { cwd, env: { ...env, ...extra }, stdio: ["ignore", log, log], timeout: 600000 });
  assert.equal(r.status, 0, `${command} failed (${r.error?.message || r.status}); see ${join(scratch, "commands.log")}`);
};
const read = file => readFileSync(join(project, file), "utf8");
const write = (file, body) => writeFileSync(join(project, file), body);
let server, browser;
console.log(`Artifacts: ${scratch}`);
try {
  verifyBundledStarter();
  run("git", ["init", "-q"], brain);
  run("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Starter Smoke", "--one-liner", "Synthetic event campaign", "--owner", "Starter Smoke <smoke@example.invalid>", "--dashboard", "on-demand"], brain);
  run(process.execPath, [join(plugin, "skills/gtm-brain-project/project.mjs"), brain, "--link", project, "--create", "--starter", "web-design-system", "--slug", "website", "--title", "Website"], brain);
  verifyPreparedStarter(project);
  run("npm", ["ci"]);
  run("npx", ["playwright", "install", "chromium"]);
  run("npm", ["run", "build"]); // unchanged starter before any company customisation

  // Brief: a reusable two-day event agenda, switched with buttons, using shared cards.
  write("src/sections/EventAgenda.astro", `---
import Section from "../components/layout/Section.astro";
import Container from "../components/layout/Container.astro";
import SectionHeader from "../components/ui/SectionHeader.astro";
import Button from "../components/ui/Button.astro";
import Card from "../components/ui/Card.astro";
interface Props { heading: string; days: { label: string; title: string; text: string }[] }
const { heading, days } = Astro.props;
---
<Section label={heading}>
  <Container class="flex flex-col gap-8">
    <SectionHeader heading={heading} />
    <div data-event-agenda class="flex flex-col gap-6">
      <div class="flex flex-wrap gap-3" role="group" aria-label="Choose a day">
        {days.map((day, index) => <Button data-day={index} aria-pressed={index === 0}>{day.label}</Button>)}
      </div>
      {days.map((day, index) => <div data-session={index} hidden={index !== 0}><Card title={day.title} text={day.text} /></div>)}
    </div>
  </Container>
</Section>
<script>
  for (const agenda of document.querySelectorAll<HTMLElement>("[data-event-agenda]")) {
    for (const button of agenda.querySelectorAll<HTMLButtonElement>("[data-day]")) {
      button.addEventListener("click", () => {
        for (const other of agenda.querySelectorAll<HTMLButtonElement>("[data-day]")) other.setAttribute("aria-pressed", String(other === button));
        for (const session of agenda.querySelectorAll<HTMLElement>("[data-session]")) session.hidden = session.dataset.session !== button.dataset.day;
      });
    }
  }
</script>
`);
  const days = [{ label: "Day one", title: "Customer interviews", text: "Practise asking useful questions." }, { label: "Day two", title: "Campaign planning", text: "Turn evidence into a campaign brief." }];
  write("src/sections/index.ts", read("src/sections/index.ts").replace(/^import Hero from "\.\/Hero\.astro";/m, 'import Hero from "./Hero.astro";\nimport EventAgenda from "./EventAgenda.astro";').replace("export const sections = {", `export const sections = {\n  "event-agenda": section({ component: EventAgenda, example: { heading: "Workshop agenda", days: ${JSON.stringify(days)} }, source: "new: two-day agenda acceptance brief" }),`));
  for (const [route, heading] of [["campaign-one", "Meet the customer team"], ["campaign-two", "Plan the next campaign"]]) write(`src/pages/${route}.astro`, `---
import Base from "../layouts/Base.astro";
import Navbar from "../components/layout/Navbar.astro";
import Footer from "../components/layout/Footer.astro";
import Hero from "../sections/Hero.astro";
import EventAgenda from "../sections/EventAgenda.astro";
---
<Base title="${heading}" description="Synthetic campaign for starter acceptance testing.">
  <Navbar />
  <main><Hero heading="${heading}" lead="Two practical days for the team." /><EventAgenda heading="Workshop agenda" days={${JSON.stringify(days)}} /></main>
  <Footer />
</Base>
`);
  write("docs/design.md", read("docs/design.md") + "\n## Event agenda\n\nA registered two-day agenda with shared buttons and cards. Day buttons switch the visible session; both campaign pages consume the same section.\n");
  // One shared component edit must propagate to both pages without copying the component.
  write("src/components/ui/Card.astro", read("src/components/ui/Card.astro").replace("<article\n", '<article data-shared-proof="reused"\n'));
  run("npm", ["run", "build"]);
  const listener = createServer(); await new Promise(done => listener.listen(0, "127.0.0.1", done));
  const port = listener.address().port; await new Promise(done => listener.close(done));
  const base = `http://127.0.0.1:${port}`;
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], { cwd: project, env, detached: process.platform !== "win32", stdio: ["ignore", log, log] });
  let ready = false;
  for (const end = Date.now() + 60000; Date.now() < end;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 200));
  }
  assert.ok(ready, "local preview must respond");
  const { chromium } = createRequire(join(project, "package.json"))("playwright"); browser = await chromium.launch();
  const checks = [];
  for (const width of [375, 768, 1440]) for (const route of ["/design-system", "/campaign-one", "/campaign-two", "/design-system/sections/event-agenda"]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    assert.equal((await page.goto(base + route, { waitUntil: "networkidle" })).status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
    if (route !== "/design-system") {
      // Brian's catalogue embeds the real section in a preview iframe.
      const section = route.startsWith("/design-system/") ? page.frameLocator("iframe").first() : page;
      assert.ok(await section.locator('[data-shared-proof="reused"]').count() >= 2, "shared Card edit reaches every consumer");
      await section.getByRole("button", { name: "Day two", exact: true }).click();
      assert.equal(await section.getByRole("button", { name: "Day two", exact: true }).getAttribute("aria-pressed"), "true");
      assert.ok(await section.getByText("Campaign planning", { exact: true }).isVisible());
      assert.equal(await section.getByText("Customer interviews", { exact: true }).isVisible(), false);
      await section.getByRole("button", { name: "Day one", exact: true }).focus(); await page.keyboard.press("Enter");
      assert.ok(await section.getByText("Customer interviews", { exact: true }).isVisible());
      const contrast = await section.locator("[data-day]").first().evaluate(button => {
        const style = getComputedStyle(button), canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
        const luminance = colour => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05);
      });
      assert.ok(contrast >= 4.5, `primary button contrast ${contrast}`);
    }
    assert.deepEqual(errors, []); checks.push({ route, width, passed: true }); await page.close();
  }
  await browser.close(); browser = null;
  run("npm", ["run", "shots", "--", "/design-system", "/campaign-one", "/campaign-two", "/design-system/sections/event-agenda"], project, { SHOTS_URL: base });
  run(process.execPath, ["scripts/extract.mjs", `${base}/campaign-one`, "--section", "Workshop agenda"]);
  assert.equal(readStarterProject(project).compatible, true);
  assert.equal(existsSync(join(project, ".vercel")), false);
  verifyBundledStarter();
  writeFileSync(join(scratch, "result.json"), JSON.stringify({ passed: true, brain, project, checks, sourcePreserved: true, deployed: false }, null, 2) + "\n");
  console.log(`PASS: ${checks.length} route/viewport checks, keyboard interaction, contrast, shared component reuse, original shots/extract scripts. ${join(scratch, "result.json")}`);
} finally {
  if (browser) await browser.close();
  if (server) spawnSync("npm", ["run", "dev", "--", "stop"], { cwd: project, env, stdio: ["ignore", log, log], timeout: 15000 });
  if (server) { try { if (process.platform === "win32") server.kill(); else process.kill(-server.pid, "SIGTERM"); } catch {} }
  stopBrainWatcher(brain); closeSync(log);
}
