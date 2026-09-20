import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import * as lib from "../lib/brain.mjs";

const plugin = new URL("../", import.meta.url).pathname;
const env = { ...process.env, GTM_OS_NO_COMMIT: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_OPEN: "1" };
process.env.GTM_OS_NO_COMMIT = "1"; process.env.GTM_OS_NO_COMPILE = "1";
const at = n => `2026-09-${String(n).padStart(2,"0")}T10:00:00Z`;
function setup() {
  const root = mkdtempSync(join(tmpdir(), "gtm-customers-"));
  mkdirSync(join(root, "brain")); mkdirSync(join(root, "work"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", tools: ["attio", "gmail"], team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(root, "icp", { title: "Target customers" });
  lib.writeContext(root, "strategy", { title: "Strategy" });
  return root;
}
function relationship(root, name, status = "customer", extra = {}) {
  const { customer = {}, ...rest } = extra;
  lib.addName(root, name);
  return lib.appendMemory(root, "icp", { authors: ["ann"], content: `${name} is ${status}.`, source: [{ kind: "attio", ref: "https://crm.test/"+name }], at: at(10), ...rest,
    customer: { entity: name, status, basis: "source", observed_at: at(10), ...customer } }).rec;
}
function remember(root, memories) {
  const file = join(root, "work", "input.json"); writeFileSync(file, JSON.stringify(memories));
  return spawnSync(process.execPath, [join(plugin,"scripts/gtm-os-remember/remember.mjs"),root,"--by","ann","--batch",file], { env, encoding: "utf8" });
}

test("50 requested members survive capture beyond activity sampling; repeat capture keeps identities and memories", () => {
  const root = setup();
  const entries = Array.from({length:50}, (_,i) => {
    const name = `Member${i} Surname${i}`;
    return { context: "icp", content: `${name} is a paying community member.`, sources: [`community:https://community.test/members/${i}`], customer: { entity: name, status: "customer", basis: "source", observed_at: at(10), reference: { kind: "community", ref: `https://community.test/members/${i}` } } };
  });
  const first = remember(root,entries); assert.equal(first.status,0,first.stderr); assert.match(first.stdout,/kept 50 of 50/);
  assert.equal(lib.customerOverview(root).customers.length,50);
  assert.equal(lib.readNames(root).filter(n=>!n.name.startsWith("Ann")).length,50);
  const before = readFileSync(join(root,"brain/contexts/icp/memories.jsonl"),"utf8");
  assert.equal(remember(root,entries).status,0);
  assert.equal(readFileSync(join(root,"brain/contexts/icp/memories.jsonl"),"utf8"),before);
  // A source rename reuses the stable record and keeps its canonical identity.
  const renamed = structuredClone(entries[0]); renamed.customer.entity="Renamed Member"; renamed.content="Renamed Member is a paying community member.";
  assert.equal(remember(root,[renamed]).status,0);
  assert.equal(lib.customerOverview(root).customers.length,50);
});

test("a customer absent from CRM remains after a conflicting refresh; only the person can correct it", () => {
  const root=setup();
  const confirmed=relationship(root,"Untracked Buyer","customer",{ source:[{kind:"user",ref:"ann"}],customer:{basis:"user"} });
  const before=readFileSync(join(root,"brain/contexts/icp/memories.jsonl"),"utf8");
  relationship(root,"Untracked Buyer","prospect",{at:at(11),customer:{observed_at:at(11)}});
  let view=lib.customerOverview(root).customers[0];
  assert.equal(view.status,"customer");assert.equal(view.basis,"user");assert.equal(view.conflicts.length,1);
  assert.ok(readFileSync(join(root,"brain/contexts/icp/memories.jsonl"),"utf8").startsWith(before));
  assert.throws(()=>relationship(root,"Untracked Buyer","not_customer",{supersedes:confirmed.id}),/cannot replace/);
  assert.throws(()=>lib.appendMemory(root,"icp",{authors:["ann"],content:"No result in CRM.",retracts:confirmed.id}),/cannot replace/);
  relationship(root,"Untracked Buyer","former_customer",{at:at(12),supersedes:confirmed.id,source:[{kind:"user",ref:"ann"}],customer:{basis:"user",observed_at:at(9)}});
  view=lib.customerOverview(root).customers[0];assert.equal(view.status,"former_customer");
});

test("retained source evidence is ordered by observation date; demos and ordinary contacts do not establish customers", () => {
  const root=setup();
  relationship(root,"Buyer","customer",{at:at(10),customer:{observed_at:at(10)}});
  relationship(root,"Buyer","prospect",{at:at(12),customer:{observed_at:at(3)}});
  relationship(root,"Demo Buyer","customer",{tags:["synthetic"]});
  lib.addName(root,"Meeting Contact");lib.appendMemory(root,"icp",{authors:["ann"],content:"Meeting Contact attended a meeting.",people:["Meeting Contact"]});
  const view=lib.customerOverview(root);assert.equal(view.customers.length,1);assert.equal(view.customers[0].status,"customer");assert.equal(view.customers[0].conflicts.length,0);
});

test("coverage is scoped, preserves unknown totals and cannot declare an incomplete import complete", () => {
  const root=setup();
  const capture=c=>lib.appendMemory(root,"strategy",{authors:["ann"],content:"Customer roster check.",source:[{kind:"attio",ref:"list-a"}],customer_coverage:c});
  const coverage={tool:"attio",scope:"List A",checked_at:at(10),status:"partial",scanned:20,total:50,unresolved:2};
  capture(coverage);
  assert.throws(()=>capture({...coverage,status:"complete"}),/complete coverage/);
  assert.throws(()=>capture({...coverage,unresolved:21}),/cannot exceed/);
  capture({...coverage,checked_at:at(11),scanned:50,unresolved:0,status:"complete"});
  capture({...coverage,scope:"Search B",total:null});
  assert.equal(lib.customerOverview(root).coverage.length,2);
  assert.equal(lib.customerOverview(root).coverage.find(c=>c.scope==="List A").status,"complete");
  capture({...coverage,checked_at:at(12),status:"unavailable",scanned:0,total:null,unresolved:0});
  assert.equal(lib.customerOverview(root).coverage.find(c=>c.scope==="List A").status,"unavailable");
  const rejected=remember(root,[{context:"icp",content:"A is a customer.",sources:["user:ann"],customer:{entity:"A",status:"customer",basis:"user",observed_at:at(10)}},{context:"strategy",content:"All captured.",sources:["user:ann"],customer_coverage:coverage}]);
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/separate call/);assert.equal(lib.customerOverview(root).customers.length,0);
});

test("suggested searches require installed and successfully tested connectors, including sources beyond CRM", () => {
  const root=setup();const state={};
  for(const tool of ["Gmail","Google Calendar","Granola","Stripe","Google Drive","Attio"])state[tool]={tool,status:"installed",test:"ok"};
  state.Attio.status="installed, disabled";state.Stripe.test="fail";state.Granola.declined=true;
  state.Notion={tool:"Notion",status:"available, not installed",test:"ok"};
  writeFileSync(join(root,"work/tools.json"),JSON.stringify(state));
  assert.deepEqual(lib.customerOverview(root).suggestions.map(s=>s.tool),["Gmail","Google Calendar","Google Drive"]);
});

test("invalid evidence writes nothing; ambiguous source identity holds only its entry", () => {
  const root=setup();
  const good={context:"icp",content:"Unaffiliated Person is a customer.",sources:["user:ann"],customer:{entity:"Unaffiliated Person",status:"customer",basis:"user",observed_at:at(10)}};
  const bad={...good,customer:{...good.customer,observed_at:"2026-02-31T00:00:00Z"}};
  assert.notEqual(remember(root,[good,bad]).status,0);assert.equal(lib.readMemories(root,"icp").length,0);
  const ref={kind:"attio",ref:"record-1"};lib.addName(root,"First Buyer",{references:[ref]});lib.addName(root,"Second Buyer",{references:[ref]});
  const result=remember(root,[{...good,customer:{...good.customer,entity:"Unknown Buyer",reference:ref}},good]);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/multiple identities/);assert.match(result.stdout,/kept 1 of 2/);
  assert.equal(lib.customerOverview(root).customers.length,1);
});

test("forking customer evidence retains one relationship and its source references", () => {
  const root=setup();relationship(root,"Buyer");
  execFileSync(process.execPath,[join(plugin,"scripts/gtm-os-contexts/contexts.mjs"),root,"--fork","icp","account","Account"],{env});
  const view=lib.customerOverview(root);assert.equal(view.customers.length,1);assert.equal(view.customers[0].history.length,1);assert.equal(view.customers[0].context,"account");
});

test("Customers dashboard searches and opens entities, labels partial coverage, escapes source content", () => {
  const root=setup();relationship(root,'Buyer <script>');
  const data={names:lib.readNames(root),customers:lib.customerOverview(root)};
  data.customers.coverage=[{tool:"attio",scope:"List",status:"partial",scanned:1,total:50,unresolved:0,checked_at:at(10),note:"Only page one.",sources:[],memory:"m_123456"}];
  const template=readFileSync(join(plugin,"scripts/gtm-os-render/home.template.html"),"utf8");
  {
    const nodes=new Map();const $=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:"",focus(){},setSelectionRange(){}});return nodes.get(s)};
    const scope=createContext({D:data,$,esc:s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),citePill:id=>id,sourcesHtml:list=>(list||[]).map(r=>r.kind).join("")});
    const html=template;
    const start=html.indexOf("/* customers: a retained"),end=html.indexOf('$("#brand-co")',start);
    assert.ok(start>=0&&end>start,"the customer view script has explicit boundaries");
    runInContext(html.slice(html.indexOf("const localClock="),html.indexOf("const recordingTime=")),scope);
    runInContext(html.slice(start,end),scope);
    assert.match($("#customers-list").innerHTML,/data-entity="Buyer &lt;script&gt;"/);
    assert.doesNotMatch($("#customers-list").innerHTML,/<script>/);
    assert.match($("#customers-coverage").innerHTML,/1\/50/);
    assert.match($("#customers-coverage").innerHTML,/Partial/);
    $("#customer-query").oninput({target:{value:"missing",selectionStart:7}});
    assert.doesNotMatch($("#customers-list").innerHTML,/data-entity=/);
  }
});
