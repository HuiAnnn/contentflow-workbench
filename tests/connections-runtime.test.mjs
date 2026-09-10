import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const secret=crypto.getRandomValues(new Uint8Array(32));
const encode=bytes=>Buffer.from(bytes).toString('base64');
const owner='runtime-owner',legacyId=`${owner}:copy`,legacyKey='synthetic-legacy-key',newKeys=['synthetic-new-key-1','synthetic-new-key-2'];
const module=await build({stdin:{contents:`
 import {configurationInput,getModelConfiguration,createConnections,updateConnection,selectConnection,deleteConnection} from './lib/model-connections';
 import {testModel,recognizeImage} from './lib/model-service';
 export default {async fetch(request){const input=await request.json();const owner='runtime-owner';try{
  let result={};
  if(input.action==='list')return Response.json(await getModelConfiguration(owner));
  if(input.action==='test')return Response.json(await testModel(owner,input.kind));
  if(input.action==='image'){const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'});return Response.json(await recognizeImage(owner,file));}
  const data=configurationInput.parse(input);
  if(data.action==='createConnection')result=await createConnections(owner,data);
  if(data.action==='updateConnection')await updateConnection(owner,data);
  if(data.action==='selectConnection')await selectConnection(owner,data.kind,data.connectionId);
  if(data.action==='deleteConnection')await deleteConnection(owner,data.id);
  return Response.json({...result,...await getModelConfiguration(owner)});
 }catch(e){return Response.json({error:e.message},{status:400})}}};
 `,resolveDir:process.cwd(),sourcefile:'connections-runtime-fixture.ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
const outbound=[];
const runtime=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],script:module.outputFiles[0].text,d1Databases:['DB'],bindings:{MODEL_CONFIG_ENCRYPTION_KEY:encode(secret)},outboundService:async request=>{outbound.push({key:request.headers.get('Authorization'),body:await request.json()});return Response.json({choices:[{message:{content:'verified'},finish_reason:'stop'}]})}});
try{
 const db=await runtime.getD1Database('DB');
 // Apply actual migration files, with a row encrypted using the old ID as context.
 for(const file of ['0000_calm_jackpot.sql','0001_adorable_ronan.sql','0002_custom_model_endpoint.sql']){
  const sql=await readFile(`drizzle/${file}`,'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
 }
 const key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(legacyId)},key,new TextEncoder().encode(legacyKey));
 await db.prepare('INSERT INTO model_connections (id,owner,kind,provider,model,key_ciphertext,updated_at) VALUES (?,?,?,?,?,?,?)').bind(legacyId,owner,'copy','zhipu','glm-4.7-flash',`${encode(iv)}.${encode(new Uint8Array(ciphertext))}`,new Date().toISOString()).run();
 for(const statement of (await readFile('drizzle/0003_api_connection_list.sql','utf8')).split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
 async function call(body){const response=await runtime.dispatchFetch('http://localhost',{method:'POST',body:JSON.stringify(body)});const data=await response.json();for(const key of [legacyKey,...newKeys])assert.ok(!JSON.stringify(data).includes(key));return {status:response.status,...data}}
 let data=await call({action:'list'});assert.equal(data.connections.length,1);assert.equal(data.settings.find(s=>s.kind==='copy').connectionId,legacyId);
 assert.equal((await call({action:'test',kind:'copy'})).status,200);assert.equal(outbound.at(-1).key,`Bearer ${legacyKey}`,'Legacy encrypted key remains usable after migration');
 const fields={name:'共享模型',kind:'both',endpoint:'https://open.bigmodel.cn/api/paas/v4',model:'fixture-model'};
 data=await call({action:'createConnection',...fields,apiKeys:newKeys});assert.equal(data.createdCount,2);const rows=data.connections.filter(c=>c.id!==legacyId);
 for(const row of rows){await call({action:'selectConnection',kind:'copy',connectionId:row.id});assert.equal((await call({action:'test',kind:'copy'})).status,200);assert.equal(outbound.at(-1).body.model,fields.model);const firstKey=outbound.at(-1).key;assert.ok(newKeys.some(k=>firstKey===`Bearer ${k}`));
  await call({action:'updateConnection',id:row.id,...fields,name:'已更新',model:'updated-model'});await call({action:'test',kind:'copy'});assert.equal(outbound.at(-1).key,firstKey,'Metadata edits retain encrypted keys');assert.equal(outbound.at(-1).body.model,'updated-model');
  await call({action:'selectConnection',kind:'ocr',connectionId:row.id});assert.equal((await call({action:'image'})).status,200);assert.equal(outbound.at(-1).key,firstKey);assert.ok(outbound.at(-1).body.messages[0].content[0].image_url.url.startsWith('data:image/png;base64,'));
 }
 assert.notEqual(outbound[1].key,outbound[4].key,'Different selections must send different saved keys');
 const stored=(await db.prepare('SELECT id,key_ciphertext FROM model_connections').all()).results;
 for(const row of stored){assert.ok(row.key_ciphertext.includes('.'));for(const key of [legacyKey,...newKeys])assert.ok(!row.key_ciphertext.includes(key));}
 for(const row of rows)await call({action:'deleteConnection',id:row.id});const before=outbound.length;assert.equal((await call({action:'test',kind:'copy'})).status,400);assert.equal(outbound.length,before,'No fallback or automatic outbound request after deletion');
 console.log('Passed: real D1 migrations with legacy encrypted credentials, selected keys reaching native Workers requests, OCR image encoding, metadata edits retaining keys, encrypted storage, deletion without fallback. All model traffic intercepted.');
}finally{await runtime.dispose()}
