// Opt-in production MCP form test in Default mode. No Desktop UI assertions.
// Synthetic answers only. Uses the configured sign-in/model in a scratch, read-only thread.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'gtm-blocking-question-'));
const mode = 'default';
const serverPath = fileURLToPath(new URL('../../server/server.mjs', import.meta.url));
const server = spawn('codex', ['app-server', '--stdio', '-c', 'features.apps=false',
 '-c', 'mcp_servers.gtm_question_test.command="node"',
 '-c', 'mcp_servers.gtm_question_test.args=' + JSON.stringify([serverPath]),
 '-c', 'mcp_servers.gtm_question_test.tool_timeout_sec=180'], {stdio:['pipe','pipe','pipe']});
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
 if(m.method==='mcpServer/elicitation/request') {requests.push({...m,at:Date.now()});record('question',{params:m.params});}
 else if(m.method==='turn/completed'){completions.push(m.params.turn);record('completed',{status:m.params.turn.status});}
 else if(m.method==='item/completed'&&m.params.item.type==='agentMessage'){messages.push(m.params.item.text);record('message',{text:m.params.item.text});}
 else if(m.method==='item/completed'&&m.params.item.type==='mcpToolCall')record('mcp_result',{item:m.params.item});
 else if(m.method==='serverRequest/resolved')record('resolved',m.params);
 else if(m.id!==undefined){send({id:m.id,error:{code:-32601,message:'Only native questions allowed in this read-only fixture'}});fatal=Error('Unexpected request '+m.method);}
});
const watchdog=setTimeout(()=>{fatal=Error('Test exceeded four minutes');server.kill();},240000);
try {
 await call('initialize',{clientInfo:{name:'gtm_blocking_question_test',version:'1'},capabilities:{experimentalApi:true}});send({method:'initialized',params:{}});
 const modes=await call('collaborationMode/list',{});record('modes',modes);
 const t=await call('thread/start',{cwd:dir,ephemeral:true,sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'Read-only question lifecycle test. Do not use shell, web, files, connectors or other external actions. No real installation or permissions are requested. Treat submitted tool answers as synthetic test data.'});
 const threadId=t.thread.id;
 const settings={model:t.model,developer_instructions:null};
 const instructions=readFileSync(new URL('../../skills/gtm-os-start/references/questions.md',import.meta.url),'utf8');
 record('test_mode',{mode});
 await call('turn/start',{threadId,collaborationMode:{mode,settings},input:[{type:'text',text:'Exercise only the language question using this onboarding guidance:\n'+instructions+'\nCall the gtm_question_test onboarding_question MCP tool to ask language. Wait for the answer. After receiving it, report LANGUAGE_SAVED: English and stop. Do not write any files.'}]});
 await until(()=>requests.length||completions.length);
 assert.equal(requests.length,1,'Must emit an actual question, not a text substitute');
 const request=requests[0];assert.equal(request.params.mode,'form');
 assert.equal(request.params.requestedSchema.properties.selection.enum[0],'English (Recommended)');
 record('holding',{seconds:100});
 for(let i=0;i<20;i++){await pause(5000);assert.equal(completions.length,0,'Unanswered turn completed');assert(!events.some(e=>e.kind==='resolved'&&e.requestId===request.id),'Unanswered request resolved');}
 const result={action:'accept',content:{selection:'English (Recommended)'}};
 record('synthetic_answer',{heldMs:Date.now()-request.at,answer:'English'});send({id:request.id,result});
 await until(()=>completions.length===1);assert.equal(completions[0].status,'completed');assert.match(messages.at(-1),/LANGUAGE_SAVED:\s*English/);
 await call('turn/start',{threadId,collaborationMode:{mode:'default',settings},input:[{type:'text',text:'Use the gtm_question_test onboarding_question tool to ask which tools to connect in this synthetic test. Offer Gmail and Google Calendar with multiple=true. Do not ask language again. After the answer reply TOOLS: Gmail, Google Calendar. Do not install or connect real tools.'}]});
 await until(()=>requests.length===2||completions.length===2);
 assert.equal(requests.length,2,'Must ask the multiple-selection form');
 const multi=requests[1];
 assert.equal(multi.params.requestedSchema.properties.selection.type,'array');
 assert.deepEqual(multi.params.requestedSchema.properties.selection.items.enum,['Gmail','Google Calendar']);
 send({id:multi.id,result:{action:'accept',content:{selection:['Gmail','Google Calendar']}}});
 await until(()=>completions.length===2);assert.equal(completions[1].status,'completed');
 assert.match(messages.at(-1),/TOOLS: Gmail, Google Calendar/);
 record('PASS',{scope:'Production MCP form in Default mode held 100s; language answer and two checkbox selections consumed. Desktop rendering not exercised.'});
} catch(error){record('FAIL',{message:error.message});process.exitCode=1;}
finally {clearTimeout(watchdog);writeFileSync(join(dir,'events.json'),JSON.stringify(events,null,2));writeFileSync(join(dir,'stderr.log'),stderr);server.kill();console.log('Artifacts: '+dir);}
