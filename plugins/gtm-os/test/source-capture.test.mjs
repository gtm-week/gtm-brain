process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSources } from '../lib/brain.mjs';
import { loadOntology, buildTools } from '../vendor/allethic/index.mjs';

test('source parsing preserves original links, provider IDs, account selectors, commas and fragments',()=>{
 const gmail='https://mail.google.com/mail/u/2/#all/returned-id';
 const attio='https://app.attio.com/workspace/list?fields=name,email&record=returned-id#overview';
 assert.deepEqual(parseSources([`gmail:${gmail}`,`attio:${attio}`,gmail,'granola:note-id',`gmail:${gmail}`]),[
  {kind:'gmail',ref:gmail},{kind:'attio',ref:attio},{kind:'url',ref:gmail},{kind:'granola',ref:'note-id'}]);
 assert.deepEqual(parseSources(attio),[{kind:'url',ref:attio}]);
 assert.deepEqual(parseSources(),[]);
});
test('incomplete sources are rejected rather than silently losing part of a reference',()=>{
 for(const input of [['id-only'],['gmail:'],[':id'],[{}],['']])assert.throws(()=>parseSources(input),/source/);
});
test('both single and batch MCP capture schemas tell the model to preserve connector-provided source URLs',async()=>{
 const model=await loadOntology(new URL('../ontology/gtm-os.ossie.json',import.meta.url).pathname);
 const tool=buildTools(model,{act:()=>({outcome:'ok'})}).find(t=>t.name==='remember');
 const props=tool.inputSchema.properties;
 for(const schema of [props.sources,props.memories.items.properties.sources]){
  assert.match(schema.description,/permalink/);assert.match(schema.description,/exact URL/);assert.match(schema.description,/If no direct URL is returned, keep provider:ID/);
 }
});
