process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const slugs = ["company", "icp", "market", "offer", "personal-marta-nowak", "strategy"];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gtm-default-contexts-"));
  const env = { ...process.env, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-default-profile-")),
    GTM_OS_NO_COMPILE: "1", GTM_OS_NO_OPEN: "1", GTM_OS_NO_VERSION_CHECK: "1", PLUGIN_ROOT: P };
  const run = (file, ...args) => execFileSync(file.endsWith(".sh") ? "bash" : process.execPath,
    [join(P, "scripts", file), ...args], { cwd: root, env, encoding: "utf8" });
  run("gtm-os-setup/setup.sh", "--company", "Reflow", "--one-liner", "Returns automation",
    "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>",
    "--company-rule", "Keep internal decisions with their source.");
  const render = () => { run("gtm-os-render/render.mjs", root); return JSON.parse(readFileSync(join(root, "work/home/data.json"), "utf8")); };
  return { root, run, render };
}

test("setup creates six clearly named channels with stable IDs and company and personal instructions", () => {
  const { root, run } = fixture();
  assert.deepEqual(lib.listContexts(root).map(c => c.slug), slugs);
  assert.deepEqual(Object.fromEntries(lib.listContexts(root).map(c => [c.slug, c.title])), {
    company: "Our company", strategy: "Strategy", market: "Market", icp: "Target customers",
    offer: "Our offer", "personal-marta-nowak": "Personal: marta-nowak",
  });
  const company = lib.readContext(root, "company");
  assert.ok(company.rule.includes("Reflow"), "the instructions identify the brain's own organization");
  assert.equal(company.rule, "This brain belongs to Reflow. Keep internal decisions with their source.", "explicit setup rules still win");
  assert.equal(lib.readContext(root, "personal-marta-nowak").fm.personal_owner, "marta-nowak");
  assert.equal(lib.readContext(root, "personal-tomek-zielinski"), null);
  const list = JSON.parse(run("gtm-os-contexts/contexts.mjs", root, "--json"));
  assert.equal(list.find(c => c.slug === "company").rule, company.rule, "the picker receives instructions as well as title and ID");
  assert.ok(list.every(c => !Object.hasOwn(c, "scope")));
  const shown = run("gtm-os-contexts/contexts.mjs", root);
  assert.ok(shown.includes("Our company (company)"));
  assert.ok(shown.includes(company.rule));
});

test("external company evidence stays linked to its topic, without creating company channels", () => {
  const { root, run, render } = fixture();
  run("gtm-os-remember/remember.mjs", root, "--by", "marta-nowak", "--context", "icp",
    "--content", "Castorama needs returns reporting for store managers.", "--companies", "Castorama",
    "--source", "meeting:customer-research");
  run("gtm-os-remember/remember.mjs", root, "--by", "marta-nowak", "--context", "company",
    "--content", "Reflow's team meets on Mondays.", "--source", "user:marta-nowak");
  const notes = lib.readMemories(root, "icp");
  const data = render();
  assert.deepEqual(data.contexts.map(c => c.slug), slugs);
  const buyer = data.names.find(n => n.name === "Castorama");
  assert.equal(buyer.kind, "organization");
  assert.deepEqual(buyer.contexts, ["icp"]);
  assert.equal(data.admin.company, "Reflow");
  assert.deepEqual(data.contexts.find(c => c.slug === "company").memories.filter(m => !m.tags.includes("onboarding")).map(m => m.content), ["Reflow's team meets on Mondays."]);
  assert.equal(data.contexts.find(c => c.slug === "icp").title, "Target customers");
  assert.equal(data.contexts.find(c => c.slug === "icp").label, "Target customers");
  assert.equal(data.contexts.find(c => c.slug === "company").label, "Our company");
  assert.equal(data.recent.find(m => m.content.startsWith("Castorama")).contextTitle, "Target customers");
  assert.deepEqual(lib.readMemories(root, "icp"), notes, "localizing the interface never translates records");
});

test("existing default and custom covers survive seeding and rendering without migration or duplicate channels", () => {
  const { root, render } = fixture();
  lib.writeContext(root, "company", { title: "Company", rule: "Our existing rule. Our existing boundaries.", now: "Follow the approved plan." });
  lib.writeContext(root, "icp", { title: "Enterprise buyers", rule: "Keep our custom customer rule. Enterprise retail." });
  lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "An existing company note." });
  const before = ["company", "icp"].map(slug => lib.readContext(root, slug));
  lib.seedContexts(root, "marta-nowak");
  const data = render();
  assert.deepEqual(data.contexts.map(c => c.slug), slugs);
  assert.equal(data.contexts.find(c => c.slug === "company").title, "Company");
  assert.equal(data.contexts.find(c => c.slug === "company").label, "Our company");
  assert.equal(data.contexts.find(c => c.slug === "icp").label, "Enterprise buyers");
  assert.deepEqual(["company", "icp"].map(slug => lib.readContext(root, slug)), before);
});
