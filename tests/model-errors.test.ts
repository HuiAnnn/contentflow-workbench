import assert from 'node:assert/strict';
import {providerResponseError,modelErrorDetails,retrySeconds} from '../lib/model-errors';

const secret='test-private-key-never-echo';
const logs:string[]=[];
const originalLog=console.error;console.error=(message:string)=>logs.push(message);
try {
 for(const [code,pattern,wait] of [
  ['1302',/并发或请求频率/,60],['1305',/平台负载/,60],
  ['1113',/欠费/,0],['1308',/使用上限/,0],['1310',/周或月/,0],
  ['1311',/访问权限/,0],['1315',/企业编程套餐/,0],['1318',/消费上限/,0],
  ['9999',/未提供可识别的具体原因/,60],
 ] as const){
  const error=await providerResponseError('zhipu',Response.json({error:{code,message:secret}},{status:429,headers:{'Retry-After':'60'}}));
  assert.match(error.message,pattern);assert.ok(error.message.includes(code));
  assert.equal(error.retryAfterSeconds,wait);
  assert.equal(modelErrorDetails(error).upstreamStatus,429);
  assert.ok(!error.message.includes(secret));
 }
 const numeric=await providerResponseError('zhipu',Response.json({error:{code:1302}},{status:429}));
 assert.equal(numeric.providerCode,'1302');assert.equal(numeric.retryAfterSeconds,30);
 const unknown=await providerResponseError('zhipu',Response.json({error:{code:secret,message:secret}},{status:429}));
 assert.equal(unknown.providerCode,null);assert.match(unknown.message,/未提供可识别/);
 const malformed=await providerResponseError('zhipu',new Response('<html>'+secret,{status:429}));
 assert.match(malformed.message,/HTTP 429/);
 let canceled=false;
 const large=await providerResponseError('zhipu',new Response(new ReadableStream({pull(controller){controller.enqueue(new TextEncoder().encode(secret.repeat(500)))},cancel(){canceled=true}}),{status:500}));
 assert.ok(canceled);assert.equal(large.providerCode,null);
 const other=await providerResponseError('aliyun',Response.json({error:{code:'1113',message:secret}},{status:429}));
 assert.ok(!other.message.includes('欠费'),'Do not apply Zhipu code semantics to another provider');
 assert.equal(retrySeconds('120'),120);
 assert.equal(retrySeconds('Thu, 10 Sep 2026 10:02:00 GMT',Date.parse('2026-09-10T10:00:00Z')),120);
 assert.equal(retrySeconds('bad'),30);assert.equal(retrySeconds('999999999'),86400);
 assert.ok(logs.every(line=>!line.includes(secret)));
 assert.deepEqual(modelErrorDetails(new Error('other')),{});
} finally {console.error=originalLog}
console.log('Passed: distinct Zhipu 429 causes, retry timing, bounded error bodies, and credential-safe diagnostics.');
