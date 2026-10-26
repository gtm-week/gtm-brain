// Opt-in live Codex test; uses the configured model and sign-in. No real onboarding writes.
// Tests agent turn lifetime, not Desktop widget rendering or account permissions.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const scratch=mkdtempSync(join(tmpdir(),'gtm-brain-agent-wait-'));
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
import assert from 'node:assert/strict';
const server = spawn('codex', ['app-server', '--stdio', '-c', 'features.apps=false'], { stdio: ['pipe','pipe','pipe'] });
const pending = new Map(); const events = []; const cases = new Map(); let seq=0; let stderr='';
const started = Date.now();
const record = (kind, value={}) => { const row={ms:Date.now()-started,kind,...value};events.push(row);console.log(JSON.stringify(row)); };
const send = obj => server.stdin.write(JSON.stringify(obj)+'\n');
const call = (method,params) => new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});send({id,method,params});});
const pause = ms => new Promise(r=>setTimeout(r,ms));
server.stderr.on('data',x=>{stderr+=x;});
createInterface({input:server.stdout}).on('line', line=>{
 let m;try{m=JSON.parse(line)}catch{return}
 if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}return;}

 const tid=m.params?.threadId || m.params?.thread?.id;const c=cases.get(tid);
 if(m.method==='item/tool/requestUserInput'){
  if(!c){send({id:m.id,result:{answers:{}}});return;}
  c.request={id:m.id,params:m.params,at:Date.now(),native:true};
  record('question',{case:c.name,id:m.id,isBlocking:m.params.isBlocking,autoResolutionMs:m.params.autoResolutionMs,questions:m.params.questions});
 } else if(m.method==='item/tool/call') {
  record('dynamic_tool',{case:c?.name,tool:m.params.tool});
  if(c&&m.params.tool==='onboarding_test_wait'){c.waiters.push(m.id);}
  else send({id:m.id,result:{success:false,contentItems:[{type:'inputText',text:'Only the idle wait is permitted in this test.'}]}});
 } else if(m.method==='serverRequest/resolved'){
  if(c&&c.request&&m.params.requestId===c.request.id){c.resolved=Date.now();record('question_resolved',{case:c.name,afterMs:c.resolved-c.request.at});}
 } else if(m.method==='turn/completed'){
  if(c){c.completed=Date.now();c.status=m.params.turn?.status;record('turn_completed',{case:c.name,status:c.status});}
 } else if(m.method==='item/completed'&&m.params?.item?.type==='agentMessage'){
  record('message',{case:c?.name,text:m.params.item.text});
  if(c)c.messages.push(m.params.item.text);
  if(c && !c.request && m.params.item.text.includes('English (Recommended)') && m.params.item.text.includes('Polski')) { c.request={at:Date.now(),native:false}; record('question_rendered_as_text',{case:c.name}); }
 } else if(m.method==='error'){record('error',{case:c?.name,error:m.params});}
 else if(m.id!==undefined){record('unexpected_request',{method:m.method});send({id:m.id,error:{code:-32601,message:'Not permitted in selector-only fixture'}});}
});
const until=async(fn,timeout=120000)=>{const deadline=Date.now()+timeout;while(!fn()){if(Date.now()>deadline)throw new Error('Timed out waiting for expected lifecycle');await pause(100);}};
try {
 await call('initialize',{clientInfo:{name:'gtm_brain_selector_e2e',version:'1.0'},capabilities:{experimentalApi:true}});send({method:'initialized',params:{}});
 const source=readFileSync(join(repo,'INSTALL.md'),'utf8');
 const fixed=source.slice(source.indexOf('**Keep an async question'),source.indexOf('## How to talk'));
 for(const name of ['baseline','fixed']){
  const t=await call('thread/start',{cwd:scratch,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',developerInstructions:'This is a selector lifecycle test only. No shell, filesystem, web, connector, or external actions. Use the native request_user_input_async tool when available, otherwise report which input tool is available. onboarding_test_wait is an available interruptible idle wait supplied by this host. It returns when the simulated user answers. Use it when the workflow says to wait with an available wait tool.',dynamicTools:[{type:'function',name:'onboarding_test_wait',description:'Interruptible idle wait while a user input request is pending. Returns when the test user answers. Keeps the turn active. Use for the available waiting tool in the onboarding procedure.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
  const tid=t.thread.id;const c={name,waiters:[],messages:[],completed:null};cases.set(tid,c);
  record('thread',{case:name,id:tid,model:t.model});
  const instructions=name==='baseline'?'Ask a structured language question. A question ends your turn. After the async tool acknowledges it, stop immediately: no further tools or text, end with an empty final response.':fixed;
  const turn=await call('turn/start',{threadId:tid,input:[{type:'text',text:'Test only the language question, not installation. Offer English (Recommended) first and Polski second. Follow this waiting procedure exactly:\n'+instructions+'\nAfter a submitted answer, report CONFIRMED and the selected language. Do not answer for the user.'}]});
  await until(()=>c.request||c.completed);
  assert.ok(c.request,`${name}: no language question emitted`);
  if(name==='baseline'){
   await until(()=>c.completed);
   if(c.request.native)assert.ok(c.resolved,'native request cleared at completion');
   record('baseline_reproduced',{afterMs:c.completed-c.request.at,nativeRequest:c.request.native});
  }else{
   await pause(16000);
   assert.ok(!c.completed,'fixed turn must remain active while unanswered');
   assert.ok(!c.resolved,'fixed question must remain pending after 16 seconds');
   assert.ok(c.request.params?.isBlocking || c.waiters.length,'request must block or agent must use idle wait');
   record('delayed_answer',{pendingMs:Date.now()-c.request.at});
   if(c.request.native){
    const answers=Object.fromEntries(c.request.params.questions.map(q=>[q.id,{answers:['English (Recommended)']}]));
    send({id:c.request.id,result:{answers}});
   }else{
    await call('turn/steer',{threadId:tid,expectedTurnId:turn.turn.id,input:[{type:'text',text:'English'}]});
   }
   for(const id of c.waiters.splice(0))send({id,result:{success:true,contentItems:[{type:'inputText',text:'The pending user answer was submitted. Resume using the user answer.'}]}});
   await until(()=>c.completed);
   if(c.request.native)assert.ok(c.resolved,'answer must resolve pending request');
   assert.equal(c.status,'completed');
   assert.match(c.messages.at(-1),/CONFIRMED[: ]+English/);
  }
 }
 record('PASS',{scope:'Agent waiting lifecycle only. Native Desktop widget rendering is not exercised by this client.'});
}catch(e){record('FAIL',{message:e.message});process.exitCode=1;}
finally{writeFileSync(join(scratch,'events.json'),JSON.stringify(events,null,2));writeFileSync(join(scratch,'stderr.log'),stderr);server.kill('SIGTERM');console.log('Artifacts: '+scratch);}
