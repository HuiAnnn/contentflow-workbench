import assert from 'node:assert/strict';
import {modelChat,validateGenerated,imageMessages,configurationInput} from '../lib/model-service';
import {defaultModel,defaultProvider} from '../lib/model-presets';
import {moduleNames} from '../lib/workflow';
const config={provider:'gemini' as const,model:'gemini-3.8-flash',key:'test-only-never-a-real-key'};
let calls=0;
const output=await modelChat(config,[{role:'user',content:'Test'}],256,async(url,init)=>{
 calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
 assert.equal(new Headers(init?.headers).get('Authorization'),`Bearer ${config.key}`);assert.equal(init?.redirect,'manual');
 const body=JSON.parse(init?.body as string);assert.equal(body.model,config.model);assert.equal(body.reasoning_effort,'low');assert.equal(body.max_tokens,256);
 return Response.json({choices:[{message:{content:' OK '},finish_reason:'stop'}]});
});assert.equal(output,'OK');assert.equal(calls,1);
for(const [status,match] of [[401,/API Key/],[429,/429/],[404,/模型/],[500,/500/]] as const){
 await assert.rejects(()=>modelChat(config,[],256,async()=>new Response(config.key,{status})),e=>e instanceof Error&&match.test(e.message)&&!e.message.includes(config.key));
}
await assert.rejects(()=>modelChat(config,[],256,async()=>new Response(`invalid ${config.key}`)),e=>e instanceof Error&&e.message==='模型服务返回了无法解析的响应。');
await assert.rejects(()=>modelChat(config,[],256,async()=>Response.json({choices:[{message:{content:'partial'},finish_reason:'length'}]})),/不完整/);
await assert.rejects(()=>modelChat(config,[],256,async()=>Response.json({choices:[]})),/可用内容/);
await assert.rejects(()=>modelChat(config,[],256,async()=>{throw new DOMException('timed out','TimeoutError')}),/超时/);
await assert.rejects(()=>modelChat({...config,provider:'ocrspace'},[]),/仅支持/);
const modules=Object.fromEntries(moduleNames.map(n=>[n,'已确认的商品内容']));
const valid=JSON.stringify({versions:['标准版','场景版','搜索版'].map(label=>({label,modules:{...modules,extra:'discarded'}}))});
assert.equal(validateGenerated('```json\n'+valid+'\n```').length,3);assert.equal(Object.keys(validateGenerated(valid)[0].modules).length,5);
assert.throws(()=>validateGenerated('{bad'),/结构化/);
assert.throws(()=>validateGenerated(JSON.stringify({versions:[{label:'唯一',modules}]})),/不完整/);
const incomplete=JSON.parse(valid);delete incomplete.versions[1].modules['商品标题'];assert.throws(()=>validateGenerated(JSON.stringify(incomplete)),/不完整/);
console.log('Passed: provider protocol, secret-safe failures, limits, timeout, structured content validation. No external model calls.');

assert.equal(defaultProvider,'aliyun');assert.equal(defaultModel('aliyun','ocr'),'qwen-vl-ocr');assert.equal(defaultModel('aliyun','copy'),'qwen-flash');assert.equal(defaultModel('zhipu','ocr'),'glm-4.6v-flash');assert.equal(defaultModel('zhipu','copy'),'glm-4.7-flash');
const image='data:image/png;base64,dGVzdA==';
for(const [provider,model,expectedURL] of [
 ['aliyun','qwen-flash','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'],
 ['aliyun','qwen-vl-ocr','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'],
 ['zhipu','glm-4.7-flash','https://open.bigmodel.cn/api/paas/v4/chat/completions'],
 ['zhipu','glm-4.6v-flash','https://open.bigmodel.cn/api/paas/v4/chat/completions']
] as const){
 const kind=model.includes('ocr')||model.includes('4.6v')?'ocr':'copy';
 assert.ok(configurationInput.safeParse({action:'save',kind,provider,model,apiKey:config.key}).success);
 await modelChat({...config,provider,model},kind==='ocr'?imageMessages(image):[{role:'user',content:'test'}],4096,async(url,init)=>{
  assert.equal(url,expectedURL);const b=JSON.parse(init?.body as string);
  if(model==='qwen-flash')assert.equal(b.enable_thinking,false);
  if(model==='qwen-vl-ocr'){assert.ok(!('enable_thinking' in b));assert.ok(!('reasoning_effort' in b));}
  if(provider==='zhipu')assert.deepEqual(b.thinking,{type:'disabled'});
  if(kind==='ocr'){assert.equal(b.messages.length,1);assert.equal(b.messages[0].role,'user');assert.equal(b.messages[0].content[0].image_url.url,image)}
  return Response.json({choices:[{message:{content:'verified'},finish_reason:'stop'}]});
 });
}
console.log('Passed: domestic model defaults, accepted configuration, correct endpoints and non-thinking/image request formats.');
