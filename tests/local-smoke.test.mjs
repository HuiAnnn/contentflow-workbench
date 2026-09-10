import assert from 'node:assert/strict';
const base=process.env.CONTENTFLOW_TEST_URL||'http://127.0.0.1:5173';
const target=new URL(base);
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('本测试只能对本机服务运行。');
const anonymous=await fetch(base+'/api/workspace');assert.equal(anonymous.status,401);
const spoofed=await fetch(base+'/api/workspace',{headers:{'oai-authenticated-user-id':'spoofed','oai-authenticated-user-email':'spoofed@example.invalid'}});assert.equal(spoofed.status,401,'Development gateway must strip forged identity headers');
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});assert.equal(login.status,302);assert.equal(login.headers.get('location'),'/');
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Local login must issue a cookie');
const headers={cookie,Origin:base,'Content-Type':'application/json'};
async function request(path,body){const response=await fetch(base+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data}}
const home=await fetch(base+'/',{headers});assert.equal(home.status,200);
let workspace=(await request('/api/workspace')).data;assert.ok(Array.isArray(workspace.products));
const modelKey='synthetic-local-smoke-key-not-a-real-credential';
let result=await request('/api/model-settings',{action:'createConnection',name:'本地验证连接',kind:'copy',endpoint:'https://models.example.com/v1',model:'local-test',apiKeys:[modelKey]});assert.equal(result.status,200,result.data.error);assert.ok(!JSON.stringify(result.data).includes(modelKey));
const testConnection=result.data.connections.find(c=>c.name==='本地验证连接');assert.ok(testConnection);
result=await request('/api/model-settings',{action:'deleteConnection',id:testConnection.id});assert.equal(result.status,200);
async function run(command,expected=200){const result=await request('/api/workspace',{revision:workspace.revision,command});assert.equal(result.status,expected,result.data.error);if(expected===200)workspace=result.data.workspace;return result.data}
const created=await run({action:'create',source:'商品名称：本地验证商品\n类目：测试用品',owner:'陈思思'});const id=created.result.id;
const product=workspace.products.find(p=>p.id===id);
await run({action:'generate',id},400);
await run({action:'fields',id,fields:product.fields.map(f=>({...f,value:f.name==='商品名称'?'本地验证商品':f.name==='类目'?'测试用品':f.value,confirmed:true}))});
await run({action:'generate',id});await run({action:'publish',id},400);await run({action:'submit',id});await run({action:'approve',id});assert.equal(workspace.products.find(p=>p.id===id).stage,'ready');
await run({action:'publish',id});assert.equal(workspace.products.find(p=>p.id===id).stage,'published');
const catalog=await fetch(base+`/catalog/${id}`,{headers});assert.equal(catalog.status,200);assert.ok((await catalog.text()).includes('本地验证商品'));
const persisted=(await request('/api/workspace')).data;assert.ok(persisted.products.some(p=>p.id===id&&p.publications.length));
const logout=await fetch(base+'/signout-with-chatgpt?return_to=/',{headers,redirect:'manual'});assert.equal(logout.status,302);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
assert.equal((await fetch(base+'/api/workspace')).status,401);
console.log('通过：本地 cookie 登录、伪造身份拒绝、数据库读写、加密连接增删、字段核对、模板内容、审核发布、商品页与退出登录。没有调用真实模型。');
