import assert from 'node:assert/strict';
const base=process.env.CONTENTFLOW_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('隔离测试仅允许本机运行。');
const home=await fetch(base+'/',{redirect:'manual'});
assert.equal(home.status,200,'Anonymous home must open without a login redirect');
assert.equal(home.headers.get('location'),null);
async function visitor(){
 const r=await fetch(base+'/api/visitor-session',{method:'POST',headers:{Origin:base}});
 assert.equal(r.status,200);assert.equal((await r.json()).mode,'guest');
 const setCookie=r.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);
 assert.match(setCookie,/Max-Age=2592000/);assert.match(r.headers.get('cache-control'),/no-store/);
 return setCookie.split(';')[0];
}
const a=await visitor(),b=await visitor();assert.notEqual(a,b,'Visitors must receive independent sessions');
async function request(cookie,path,body){
 const r=await fetch(base+path,{headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
const reused=await fetch(base+'/api/visitor-session',{method:'POST',headers:{Cookie:a,Origin:base}});
assert.equal(reused.status,200);assert.equal(reused.headers.get('set-cookie'),null,'Opening another tab must reuse the same workspace');
const cross=await fetch(base+'/api/visitor-session',{method:'POST',headers:{Origin:'https://unrelated.example','Sec-Fetch-Site':'cross-site'}});assert.equal(cross.status,403);
const tampered=a.replace(/(v1\.)([a-f0-9])/,(_,prefix,c)=>prefix+(c==='0'?'1':'0'));
assert.equal((await request(tampered,'/api/workspace')).status,401);
assert.equal((await request('contentflow_visitor=local_seedy','/api/workspace')).status,401);
assert.equal((await request(a+'; '+b,'/api/workspace')).status,401);
const expired=a.replace(/\.[0-9]{10}\./,'.1000000000.');assert.equal((await request(expired,'/api/workspace')).status,401);
const first=await request(a,'/api/workspace');assert.equal(first.status,200);let workspace=first.data;
assert.equal((await request(b,'/api/workspace')).status,200);
const marker='访客隔离验证 '+crypto.randomUUID();
async function run(command){const r=await request(a,'/api/workspace',{revision:workspace.revision,command});assert.equal(r.status,200,r.data.error);workspace=r.data.workspace;return r.data.result;}
const {id}=await run({action:'create',source:`商品名称：${marker}\n类目：测试用品`,owner:'陈思思'});
assert.ok(!(await request(b,'/api/workspace')).data.products.some(p=>p.id===id));
const product=workspace.products.find(p=>p.id===id);
await run({action:'fields',id,fields:product.fields.map(f=>({...f,confirmed:true}))});
await run({action:'generate',id});await run({action:'submit',id});await run({action:'approve',id});await run({action:'publish',id});
assert.equal((await fetch(base+`/catalog/${id}`,{headers:{Cookie:a},redirect:'manual'})).status,200);
assert.equal((await fetch(base+`/catalog/${id}`,{headers:{Cookie:b},redirect:'manual'})).status,404,'Another visitor must not read private publication snapshots');
const key='synthetic-visitor-key-not-a-real-credential';
const added=await request(a,'/api/model-settings',{action:'createConnection',name:marker,kind:'copy',endpoint:'https://models.example.com/v1',model:'visitor-test',apiKeys:[key]});
assert.equal(added.status,200,added.data.error);assert.ok(!JSON.stringify(added.data).includes(key));
const connection=added.data.connections.find(c=>c.name===marker);assert.ok(connection);
const other=await request(b,'/api/model-settings');assert.equal(other.status,200);assert.ok(!other.data.connections.some(c=>c.id===connection.id));
assert.equal((await request(b,'/api/model-settings',{action:'selectConnection',kind:'copy',connectionId:connection.id})).status,400);
assert.equal((await request(b,'/api/model-settings',{action:'testConnection',kind:'copy',id:connection.id})).status,400);
assert.equal((await request(b,'/api/model-settings',{action:'deleteConnection',id:connection.id})).status,400);
assert.equal((await request(b,'/api/model-settings',{action:'updateConnection',id:connection.id,name:'Blocked change',kind:'copy',endpoint:'https://models.example.com/v1',model:'visitor-test'})).status,400);
assert.equal((await request(a,'/api/model-settings',{action:'deleteConnection',id:connection.id})).status,200);
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});assert.equal(login.status,302);
const accountCookie=login.headers.get('set-cookie').split(';')[0];
const account=await request(accountCookie,'/api/workspace');assert.equal(account.status,200);assert.ok(!account.data.products.some(p=>p.id===id));
const accountWithGuest=await request(accountCookie+'; '+a,'/api/workspace');assert.equal(accountWithGuest.status,200);assert.deepEqual(accountWithGuest.data,account.data,'Signed-in account must take precedence over the visitor cookie');
assert.ok((await request(a,'/api/workspace')).data.products.some(p=>p.id===id&&p.publications.length),'Reusing the visitor session must retain saved products');
console.log('通过：免登录首页、独立访客会话、Cookie 防篡改、跨站请求拒绝、完整审核发布流程，以及商品、发布快照和 API Key 的跨访客/账户隔离。未调用真实模型。');
