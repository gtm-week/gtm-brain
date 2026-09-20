// Opt-in model test through the supported app-server API. No Desktop UI assertions.
// Synthetic answers only. Uses the configured sign-in/model in a scratch, read-only thread.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'gtm-blocking-question-'));
const mode = process.argv.includes('--default-mode') ? 'default' : 'plan';
const server = spawn('codex', ['app-server', '--stdio', '-c', 'features.apps=false',
 ...(mode === 'default' ? ['-c', 'features.default_mode_request_user_input=true'] : [])], {stdio:['pipe','pipe','pipe']});
const pending = new Map(), requests = [], messages = [], completions = [], events = [];
let seq = 0, stderr = '', fatal;
const record = (kind, details = {}) => {const row = {time:new Date().toISOString(),kind,...details}; events.push(row); console.log(JSON.stringify(row));};
const send = message => server.stdin.write(JSON.stringify(message) + '\n');
const call = (method, params) => new Promise((resolve,reject) => {const id = ++seq; pending.set(id,{resolve,reject}); send({id,method,params});});
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const until = async check => {const end = Date.now()+120000; while(!check()){if(fatal)throw fatal;if(Date.now()>end)throw Error('Expected event did not arrive');await pause(100);}};
server.stderr.on('data', data => {stderr += data;});
server.on('error', error => {fatal = error;});
server.on('exit', () => {for(const p of pending.values())p.reject(Error('App server exited'));pending.clear();});
createInterface({input:server.stdout}).on('line', line => {
 let m; try {m=JSON.parse(line);} catch {return;}
 if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}return;}
 if(m.method==='item/tool/requestUserInput') {requests.push({...m,at:Date.now()});record('question',{isBlocking:m.params.isBlocking,questions:m.params.questions});}
 else if(m.method==='turn/completed'){completions.push(m.params.turn);record('completed',{status:m.params.turn.status});}
 else if(m.method==='item/completed'&&m.params.item.type==='agentMessage'){messages.push(m.params.item.text);record('message',{text:m.params.item.text});}
 else if(m.method==='serverRequest/resolved')record('resolved',m.params);
 else if(m.id!==undefined){send({id:m.id,error:{code:-32601,message:'Only native questions allowed in this read-only fixture'}});fatal=Error('Unexpected request '+m.method);}
});
const watchdog=setTimeout(()=>{fatal=Error('Test exceeded four minutes');server.kill();},240000);
try {
 await call('initialize',{clientInfo:{name:'gtm_blocking_question_test',version:'1'},capabilities:{experimentalApi:true}});send({method:'initialized',params:{}});
 const modes=await call('collaborationMode/list',{});record('modes',modes);
 const t=await call('thread/start',{cwd:dir,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',developerInstructions:'Read-only question lifecycle test. Do not use shell, web, files, connectors or other external actions. No real installation or permissions are requested. Treat submitted tool answers as synthetic test data.'});
 const threadId=t.thread.id;
 const settings={model:t.model,developer_instructions:null};
 const instructions=readFileSync(new URL('../../skills/gtm-os-start/references/questions.md',import.meta.url),'utf8');
 record('test_mode',{mode});
 await call('turn/start',{threadId,collaborationMode:{mode,settings},input:[{type:'text',text:'Exercise only the language question using this onboarding guidance:\n'+instructions+'\nAsk for language using request_user_input: English (Recommended) first, Polski second. Wait for the answer. After receiving it, report LANGUAGE_SAVED: English and stop. Do not write any files.'}]});
 await until(()=>requests.length||completions.length);
 assert.equal(requests.length,1,'Must emit an actual question, not a text substitute');
 const request=requests[0];assert.equal(request.params.isBlocking,true,mode+' question must block');
 assert.match(request.params.questions[0].options[0].label,/English/);
 record('holding',{seconds:65});
 for(let i=0;i<13;i++){await pause(5000);assert.equal(completions.length,0,'Unanswered turn completed');assert(!events.some(e=>e.kind==='resolved'&&e.requestId===request.id),'Unanswered request resolved');}
 const answers=Object.fromEntries(request.params.questions.map(q=>[q.id,{answers:['English (Recommended)']}]));
 record('synthetic_answer',{heldMs:Date.now()-request.at,answer:'English'});send({id:request.id,result:{answers}});
 await until(()=>completions.length===1);assert.equal(completions[0].status,'completed');assert.match(messages.at(-1),/LANGUAGE_SAVED:\s*English/);
 await call('turn/start',{threadId,collaborationMode:{mode:'default',settings},input:[{type:'text',text:'Execution has resumed. Reuse the language choice already submitted in this conversation. Do not ask it again. No actual installation or file changes. Reply exactly RESUMED: English.'}]});
 await until(()=>completions.length===2||requests.length>1);assert.equal(requests.length,1,'Mode transition repeated a known question');assert.equal(completions[1].status,'completed');assert.match(messages.at(-1),/RESUMED:\s*English/);
 record('PASS',{scope:'Real model + blocking protocol question held 65s in '+mode+' mode; answer reused in Default. Desktop rendering not exercised.'});
} catch(error){record('FAIL',{message:error.message});process.exitCode=1;}
finally {clearTimeout(watchdog);writeFileSync(join(dir,'events.json'),JSON.stringify(events,null,2));writeFileSync(join(dir,'stderr.log'),stderr);server.kill();console.log('Artifacts: '+dir);}
