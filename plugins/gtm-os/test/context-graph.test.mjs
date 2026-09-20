import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {contextGraph,indexedContextGraph} from '../lib/context-graph.mjs';
const memory=(id,extra={})=>({id,content:'Same words',tags:[],source:[],...extra});
const copy=(id,origin)=>memory(id,{tags:['forked:a'],source:[{kind:'memory',ref:origin}]});
test('shared memories follow fork ancestry, not similar text; copies count once per context',()=>{
 const graph=contextGraph([{slug:'a',memories:[memory('one'),memory('two')]},{slug:'b',memories:[copy('copy','one'),copy('duplicate','one'),memory('separate')]},{slug:'c',memories:[copy('next','copy')]},{slug:'empty',memories:[]}]);
 assert.deepEqual(graph.nodes.map(n=>n.count),[2,2,1,0]);
 assert.deepEqual(graph.links.map(l=>[l.a,l.b,l.count]),[['a','b',1],['a','c',1],['b','c',1]]);
});
test('withdrawn and superseded records do not create current membership',()=>{
 const graph=contextGraph([{slug:'a',memories:[memory('one'),memory('new',{supersedes:'one'})]},{slug:'b',memories:[copy('copy','one'),memory('withdraw',{retracts:'copy'})]},{slug:'c',status:'archived',memories:[copy('retained','copy')]}]);
 assert.deepEqual(graph.nodes.map(n=>n.count),[1,0,1]);assert.equal(graph.links.length,0);
});
test('indexed graph counts the full corpus beyond a 50-record preview',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE memories(rowid INTEGER PRIMARY KEY,id TEXT,file TEXT,effective INTEGER,raw TEXT); CREATE TABLE forks(memory INTEGER,target TEXT)');
  const add=db.prepare('INSERT INTO memories VALUES (?,?,?,?,?)'),fork=db.prepare('INSERT INTO forks VALUES (?,?)');
  const contexts=[{slug:'a',memories:[]},{slug:'b',memories:[]}];
  for(let i=0;i<60;i++){
   const a=memory('original-'+i),b=copy('copy-'+i,a.id);
   contexts[0].memories.push(a);contexts[1].memories.push(b);
   add.run(i+1,a.id,'a',1,JSON.stringify(a));add.run(i+101,b.id,'b',1,JSON.stringify(b));fork.run(i+101,a.id);
  }
  const graph=indexedContextGraph(db,contexts.map(c=>({...c,memories:c.memories.slice(0,50)})));
  const expected=contextGraph(contexts);
  assert.deepEqual(graph.nodes,expected.nodes);
  assert.equal(graph.links[0].count,60);assert.equal(graph.links[0].evidence.length,5);
  db.prepare('UPDATE memories SET effective=0 WHERE rowid=101').run();
  assert.equal(indexedContextGraph(db,contexts).links[0].count,59);
 }finally{db.close()}
});
