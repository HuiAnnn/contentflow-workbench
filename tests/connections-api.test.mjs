import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787',owner=`connections-check-${Date.now()}`,other=`${owner}-other`;
const keys=['test-only-list-key-A','test-only-list-key-B','test-only-list-key-C'];
async function call(body,id=owner){const response=await fetch(base+'/api/model-settings',{headers:{'oai-authenticated-user-id':id,'oai-authenticated-user-email':'test@example.invalid','Content-Type':'application/json',Origin:base},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await response.json();const text=JSON.stringify(data);for(const key of keys)assert.ok(!text.includes(key),'Key must never appear in responses');assert.ok(!text.includes('key_ciphertext'));return {status:response.status,...data}}
const fields={name:'团队文案',kind:'copy',endpoint:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.7-flash'};
let data=await call({action:'createConnection',...fields,apiKeys:[...keys,keys[0]]});assert.equal(data.status,200);assert.equal(data.createdCount,3);assert.equal(data.connections.length,3);assert.ok(data.settings.every(s=>!s.hasKey),'Adding keys must not switch defaults');
assert.ok(data.connections.every(c=>c.provider==='zhipu'&&c.endpoint.endsWith('/chat/completions')));assert.equal(new Set(data.connections.map(c=>c.name)).size,3);
const [a,b,c]=data.connections;
let otherData=await call(undefined,other);assert.equal(otherData.connections.length,0);
for(const body of [{action:'selectConnection',kind:'copy',connectionId:a.id},{action:'updateConnection',id:a.id,...fields},{action:'testConnection',id:a.id,kind:'copy'},{action:'deleteConnection',id:a.id}]){assert.equal((await call(body,other)).status,400)}
assert.equal((await call({action:'selectConnection',kind:'ocr',connectionId:a.id})).status,400);
data=await call({action:'selectConnection',kind:'copy',connectionId:a.id});assert.equal(data.settings.find(s=>s.kind==='copy').connectionId,a.id);
data=await call({action:'selectConnection',kind:'copy',connectionId:b.id});assert.equal(data.settings.find(s=>s.kind==='copy').connectionId,b.id);
data=await call({action:'updateConnection',id:b.id,...fields,name:'修改名称',model:'new-model'});assert.equal(data.status,200);assert.equal(data.connections.find(c=>c.id===b.id).name,'修改名称');assert.equal(data.settings.find(s=>s.kind==='copy').model,'new-model');
assert.equal((await call({action:'updateConnection',id:b.id,...fields,endpoint:'https://another.example.com/v1'})).status,400);
assert.equal((await call()).connections.find(c=>c.id===b.id).model,'new-model','Failed edits preserve saved settings');
data=await call({action:'updateConnection',id:b.id,...fields,kind:'both',model:'vision-model'});assert.equal(data.status,200);
data=await call({action:'selectConnection',kind:'ocr',connectionId:b.id});assert.ok(data.settings.every(s=>s.connectionId===b.id));
data=await call({action:'updateConnection',id:b.id,...fields});assert.equal(data.settings.find(s=>s.kind==='ocr').hasKey,false);assert.equal(data.settings.find(s=>s.kind==='copy').connectionId,b.id);
assert.equal((await call({action:'createConnection',...fields,apiKeys:['valid-key','key with spaces']})).status,400);assert.equal((await call()).connections.length,3);
assert.equal((await call({action:'createConnection',...fields,apiKeys:Array(51).fill('too-many')})).status,400);
for(const endpoint of ['http://models.example.com/v1','https://127.0.0.1/v1','https://models.example.com/v1?api_key=invalid'])assert.equal((await call({action:'createConnection',...fields,endpoint,apiKeys:keys})).status,400);
data=await call({action:'deleteConnection',id:b.id});assert.equal(data.connections.length,2);assert.ok(data.settings.every(s=>!s.hasKey),'Deletion must not silently switch to another key');
assert.equal((await call({action:'selectConnection',kind:'copy',connectionId:b.id})).status,400);
for(const item of [a,c])assert.equal((await call({action:'deleteConnection',id:item.id})).status,200);
assert.equal((await call()).connections.length,0);
console.log('Passed: atomic bulk key creation, duplicate lines, owner isolation, default selection, capability checks, edits retaining credentials, destination changes, deletion and validation. No external model requests.');
