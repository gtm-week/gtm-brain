process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Onboarding progress is visible, but choices are collected only in Codex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
const template=readFileSync(new URL("../scripts/gtm-brain-render/home.template.html",import.meta.url),"utf8");
for(const [status,required] of [["pending",true],["pending",false],["pending",undefined],["completed",false],["completed",true],["dismissed",false],[null,false]]){
 test(`${status} onboarding (required: ${required}) is view-only`,()=>{
  const panel={innerHTML:""};
  const ctx=createContext({D:{onboarding:{status,required,steps:[{n:1,outcome:"Alex confirmed"}]}},$:()=>panel,esc:String});
  const source=template;
  runInContext(source.slice(source.indexOf("const OB=D.onboarding"),source.indexOf("const openCtx=")),ctx);
  if(status==="pending"&&required===true){assert.match(panel.innerHTML,/Alex confirmed/);assert.match(panel.innerHTML,/Send/);assert.match(panel.innerHTML,/Daily sync recommended/)}else assert.equal(panel.innerHTML,"");
  assert.doesNotMatch(panel.innerHTML,/<button|<input|<form|data-say/);
 });
}


test('a saved manual-sync choice replaces the recommendation without claiming a schedule', () => {
  const panel={innerHTML:""};
  const ctx=createContext({D:{onboarding:{status:"pending",required:true,steps:[{n:5,outcome:"Sync manually for now; no task created."}]}},$:()=>panel,esc:String});
  runInContext(template.slice(template.indexOf("const OB=D.onboarding"),template.indexOf("const openCtx=")),ctx);
  assert.match(panel.innerHTML,/Sync manually for now; no task created/);
  assert.doesNotMatch(panel.innerHTML,/Daily sync recommended/);
});
