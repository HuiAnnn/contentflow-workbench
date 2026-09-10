import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787';
const owner=`api-check-${Date.now()}`,other=`${owner}-other`;
const key='test-only-key-not-a-real-service-credential';
const headers=(id=owner)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':'test@example.invalid','Content-Type':'application/json',Origin:base});
const request=async(path,body,id=owner)=>{const r=await fetch(base+path,{headers:headers(id),...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(!JSON.stringify(d).includes(key),'API response leaked plaintext key');return {r,d}};
for(const path of ['/api/model-settings','/api/workspace']){const r=await fetch(base+path);assert.equal(r.status,401)}
const forged=await fetch(base+'/api/model-settings',{method:'POST',headers:{...headers(),Origin:'https://other.invalid'},body:JSON.stringify({action:'delete',kind:'copy'})});assert.equal(forged.status,403);
const malformed=await fetch(base+'/api/model-settings',{method:'POST',headers:headers(),body:`{"apiKey":${key}}`});const malformedText=await malformed.text();assert.equal(malformed.status,400);assert.ok(!malformedText.includes(key));
let defaults=await request('/api/model-settings');assert.equal(defaults.d.settings.find(s=>s.kind==='copy').model,'qwen-flash');assert.equal(defaults.d.settings.find(s=>s.kind==='ocr').model,'qwen-vl-ocr');
for(const [kind,provider,model] of [['copy','aliyun','qwen-flash'],['ocr','aliyun','qwen-vl-ocr'],['copy','zhipu','glm-4.7-flash'],['ocr','zhipu','glm-4.6v-flash']]){let r=await request('/api/model-settings',{action:'save',kind,provider,model,apiKey:key});assert.equal(r.r.status,200);assert.equal(r.d.settings.find(s=>s.kind===kind).provider,provider);r=await request('/api/model-settings',{action:'delete',kind});assert.equal(r.r.status,200)}
let res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'gemini',model:'gemini-3.8-flash',apiKey:key});assert.equal(res.r.status,200);assert.equal(res.d.settings.find(s=>s.kind==='copy').hasKey,true);
res=await request('/api/model-settings');assert.equal(res.d.settings.find(s=>s.kind==='copy').hasKey,true);
res=await request('/api/model-settings',undefined,other);assert.equal(res.d.settings.every(s=>!s.hasKey),true);
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'gemini',model:'gemini-3.8-flash'});assert.equal(res.r.status,200);
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'openrouter',model:'google/gemma-4-31b-it:free'});assert.equal(res.r.status,400);
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'ocrspace',model:'2',apiKey:key});assert.equal(res.r.status,400);
res=await request('/api/model-settings',{action:'delete',kind:'copy'});assert.equal(res.r.status,200);assert.equal(res.d.settings.find(s=>s.kind==='copy').hasKey,false);
// Custom endpoints persist without exposing the key. Changing destinations
// requires a newly supplied key; changing only the model can reuse it.
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'custom',model:'my-model',endpoint:'https://models.example.com/v1',apiKey:key});assert.equal(res.r.status,200);
assert.equal(res.d.settings.find(s=>s.kind==='copy').endpoint,'https://models.example.com/v1/chat/completions');
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'custom',model:'my-new-model',endpoint:'https://models.example.com/v1/'});assert.equal(res.r.status,200);
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'custom',model:'my-model',endpoint:'https://another.example.com/v1'});assert.equal(res.r.status,400);
res=await request('/api/model-settings');assert.equal(res.d.settings.find(s=>s.kind==='copy').endpoint,'https://models.example.com/v1/chat/completions');
res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'custom',model:'my-model',endpoint:'https://another.example.com/v1',apiKey:key});assert.equal(res.r.status,200);
res=await request('/api/model-settings',{action:'save',kind:'ocr',provider:'custom',model:'vision-model',endpoint:'https://models.example.com/v1',apiKey:key});assert.equal(res.r.status,200);
res=await request('/api/model-settings',undefined,other);assert.equal(res.d.settings.every(s=>!s.hasKey&&!s.endpoint),true);
for(const endpoint of ['http://models.example.com','https://localhost/v1','https://127.0.0.1/v1','https://models.example.com/v1?key=secret']){res=await request('/api/model-settings',{action:'save',kind:'copy',provider:'custom',model:'my-model',endpoint,apiKey:key});assert.equal(res.r.status,400)}
res=await request('/api/model-settings',{action:'delete',kind:'copy'});assert.equal(res.r.status,200);
res=await request('/api/model-settings',{action:'delete',kind:'ocr'});assert.equal(res.r.status,200);
// Keep only an OCR test credential for the local encrypted-at-rest assertion; no outbound API calls.
res=await request('/api/model-settings',{action:'save',kind:'ocr',provider:'ocrspace',model:'2',apiKey:key});assert.equal(res.r.status,200);
let workspace=(await request('/api/workspace')).d;
const run=async(command,expect=200)=>{const result=await request('/api/workspace',{revision:workspace.revision,command});assert.equal(result.r.status,expect,JSON.stringify(result.d));if(expect===200)workspace=result.d.workspace;return result.d};
const created=await run({action:'create',source:'普通商品介绍，没有规定格式',owner:'陈思思'});const id=created.result.id;
const p=workspace.products.find(p=>p.id===id);assert.equal(p.stage,'confirm');assert.ok(p.fields.every(f=>!f.value));
await run({action:'generate',id},400);
await run({action:'fields',id,fields:p.fields.map(f=>({...f,value:f.name==='商品名称'?'API 测试商品':'测试类目',confirmed:true}))});
await run({action:'generate',id});await run({action:'publish',id},400);await run({action:'submit',id});await run({action:'approve',id});
assert.equal(workspace.products.find(p=>p.id===id).stage,'ready');
await run({action:'export',ids:[id]});assert.equal(workspace.products.find(p=>p.id===id).stage,'ready');
await run({action:'publish',id});let current=workspace.products.find(p=>p.id===id);assert.equal(current.stage,'published');const live=JSON.stringify(current.publications);
const catalog=await fetch(base+`/catalog/${id}`,{headers:headers()});assert.equal(catalog.status,200);assert.ok((await catalog.text()).includes('API 测试商品'));
const outside=await fetch(base+`/catalog/${id}`,{headers:headers(other)});assert.equal(outside.status,404);
await run({action:'edit',id,modules:{...current.publications.at(-1).modules,'商品标题':'修改中的新标题'}});current=workspace.products.find(p=>p.id===id);assert.equal(JSON.stringify(current.publications),live);await run({action:'publish',id},400);
const unchanged=await fetch(base+`/catalog/${id}`,{headers:headers()});assert.ok(!(await unchanged.text()).includes('修改中的新标题'));
const conflict=await request('/api/workspace',{revision:0,command:{action:'publish',id}});assert.equal(conflict.r.status,409);
const invalidImage=new FormData();invalidImage.set('image',new File(['invalid file'],'test.png',{type:'image/png'}));const imageResult=await fetch(base+'/api/ocr',{method:'POST',headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'test@example.invalid',Origin:base},body:invalidImage});assert.equal(imageResult.status,400);assert.ok((await imageResult.json()).error.includes('有效'));
console.log('Passed: anonymous and cross-origin rejection, secret masking, isolated config save/update/delete, tolerant imports, publish gate, immutable catalog, owner isolation, optimistic concurrency, image validation. No external model requests.');
