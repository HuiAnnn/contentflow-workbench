import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

// Exercise native workerd fetch, not a JavaScript fetch mock. Request options
// accepted by Node can still fail before any network request in production.
const bundle=await build({
 stdin:{contents:`
  import {modelChat,ocrSpace,imageMessages} from './lib/model-service';
  export default {async fetch(request){
   const kind=new URL(request.url).pathname.slice(1);
   const config={provider:kind.startsWith('custom')?'custom':kind==='ocr'?'ocrspace':'zhipu',model:'test-model',key:'test-only-invalid-key',endpoint:'https://models.example.com/v1'};
   try {
    const text=kind==='ocr'
     ?await ocrSpace(config,'data:image/png;base64,dGVzdA==')
     :await modelChat(config,kind==='custom-ocr'?imageMessages('data:image/png;base64,dGVzdA=='):[{role:'user',content:'Test'}],256);
    return Response.json({text});
   } catch(error){return Response.json({error:error.message},{status:400});}
  }};`,resolveDir:process.cwd(),sourcefile:'runtime-fixture.ts'},
 bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers'],
});
let status=200;
const outgoing=[];
const runtime=new Miniflare({
 modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
 script:bundle.outputFiles[0].text,
 outboundService:async request=>{
  if(new URL(request.url).hostname==='dns.alidns.com'){assert.equal(request.headers.get('Authorization'),null);assert.equal(request.headers.get('apikey'),null);const type=new URL(request.url).searchParams.get('type');return Response.json({Status:0,Answer:[{type:type==='A'?1:28,data:type==='A'?'8.8.8.8':'2606:4700:4700::1111'}]})}
  outgoing.push(request.url);
  if(new URL(request.url).hostname==='models.example.com'){assert.equal(new URL(request.url).pathname,'/v1/chat/completions');const body=await request.clone().json();assert.equal(body.model,'test-model');assert.ok(!('thinking' in body));assert.ok(!('enable_thinking' in body));}
  if(status===307)return new Response('redirect',{status,headers:{Location:'https://redirect.invalid/never-send-key'}});
  if(status===401)return new Response('private provider error: test-only-invalid-key',{status});
  const isOCR=new URL(request.url).hostname==='api.ocr.space';
  assert.equal(request.headers.get(isOCR?'apikey':'Authorization'),isOCR?'test-only-invalid-key':'Bearer test-only-invalid-key');
  return Response.json(isOCR
   ?{OCRExitCode:1,ParsedResults:[{ParsedText:'商品资料',FileParseExitCode:1}]}
   :{choices:[{message:{content:'生成内容'},finish_reason:'stop'}]});
 },
});
try {
 for(const kind of ['copy','ocr','custom-copy','custom-ocr']){
  for(const code of [200,307,401]){
   status=code;
   const before=outgoing.length;
   const response=await runtime.dispatchFetch('http://localhost/'+kind);
   const result=await response.json();
   assert.equal(outgoing.length,before+1,'Each operation sends exactly one request; never follows redirects');
   assert.ok(!JSON.stringify(result).includes('test-only-invalid-key'),'Never echo provider secrets');
   if(code===200){assert.equal(response.status,200);assert.ok(result.text);}
   else {assert.equal(response.status,400);assert.match(result.error,code===307?/地址跳转/:/Key/);}
  }
 }
 assert.ok(outgoing.every(url=>!url.includes('redirect.invalid')));
 console.log('Passed: copy and OCR native Workers requests, redirect rejection, secret-safe provider errors. All outbound traffic intercepted.');
} finally {await runtime.dispose();}
