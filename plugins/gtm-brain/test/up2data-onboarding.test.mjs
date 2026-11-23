import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const local = new URL('../skills/topic-analyzer/scripts/up2data-account.mjs', import.meta.url);
const shipped = new URL('../skills/gtmb-topic-analyzer/scripts/up2data-account.mjs', import.meta.url);
const { checkAccount } = await import(existsSync(local) ? local : shipped);
const key = 'synthetic-test-key';
test('missing credentials make no network request', async () => {
  const result = await checkAccount({key: '', fetchImpl: () => { throw new Error('must not call'); }});
  assert.equal(result.status, 'missing_credential');
});
test('only the free fixed endpoint is called, without redirects; zero credits still authenticates', async () => {
  let calls = 0;
  const result = await checkAccount({key, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.up2data.ai/v1/account');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-API-Key'], key); assert.ok(options.signal);
    return {ok:true, json:async()=>({data:{credits_remaining:0, credits_used_this_month:7,
      price_per_1k_credits_usd:2, webhook:{signing_secret:'secret-canary'}, account_id:'private-id', tier:'private-text'}})};
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, {status:'connected',authenticated:true,credits_remaining:0,credits_used_this_month:7,price_per_1k_credits_usd:2});
});
test('HTTP errors are sanitized without reading response bodies or retrying', async () => {
  for (const [code,status] of [[401,'invalid_credential'],[429,'rate_limited'],[302,'http_error'],[500,'http_error']]) {
    let calls=0;
    const r=await checkAccount({key,fetchImpl:async()=>{calls++;return {ok:false,status:code,json:()=>{throw new Error('secret-canary')}}}});
    assert.deepEqual(r,{status,authenticated:false,http_status:code});assert.equal(calls,1);
  }
});
test('network errors and malformed JSON never disclose credentials or provider text', async () => {
  for (const fetchImpl of [async()=>{throw new Error(key)},async()=>({ok:true,json:async()=>{throw new Error('secret-canary')}})]) {
    assert.deepEqual(await checkAccount({key,fetchImpl}),{status:'connection_or_response_error',authenticated:false});
  }
});
test('malformed account envelopes cannot claim authenticated access', async () => {
  for (const data of [null,[],{}, {credits_remaining:'secret-canary'}, {credits_remaining:-1}]) {
    assert.deepEqual(await checkAccount({key,fetchImpl:async()=>({ok:true,json:async()=>({data})})}),{status:'invalid_response',authenticated:false});
  }
});
