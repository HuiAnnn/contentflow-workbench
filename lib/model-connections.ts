import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {database} from './workspace-store';
import {normalizeModelEndpoint} from './model-endpoint';
import {providerPresets,providerForEndpoint,supportsModelKind,defaultProvider,defaultModel,type Provider,type ModelKind,type ConnectionKind,type ModelStatus,type ModelConnectionSummary} from './model-presets';

export type Connection={provider:Provider;model:string;key:string;endpoint?:string;name?:string};
type Row={id:string;name:string;kind:ConnectionKind;provider:Provider;model:string;endpoint:string|null;key_ciphertext:string;updated_at:string};
const keySchema=z.string().trim().min(1).max(4096).regex(/^[\x21-\x7E]+$/);
const kindSchema=z.enum(['ocr','copy']);
const providerSchema=z.enum(['aliyun','zhipu','gemini','openrouter','ocrspace','custom']);
const connectionFields={name:z.string().trim().min(1).max(70),kind:z.enum(['ocr','copy','both']),model:z.string().trim().min(1).max(160),endpoint:z.string().trim().min(1).max(2048)} as const;
export const configurationInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('createConnection'),...connectionFields,apiKeys:z.array(keySchema).min(1).max(50)}),
 z.object({action:z.literal('updateConnection'),id:z.string().min(1).max(300),...connectionFields,apiKey:keySchema.optional()}),
 z.object({action:z.literal('deleteConnection'),id:z.string().min(1).max(300)}),
 z.object({action:z.literal('testConnection'),id:z.string().min(1).max(300),kind:kindSchema}),
 z.object({action:z.literal('selectConnection'),kind:kindSchema,connectionId:z.string().min(1).max(300).nullable()}),
 // Keep open older clients usable while existing users migrate to the list.
 z.object({action:z.literal('save'),kind:kindSchema,provider:providerSchema.optional(),model:z.string().trim().min(1).max(160).optional(),apiKey:keySchema.optional(),endpoint:z.string().trim().max(2048).optional()}),
 z.object({action:z.literal('test'),kind:kindSchema}),
 z.object({action:z.literal('delete'),kind:kindSchema}),
]);
type Input=z.infer<typeof configurationInput>;
const roleId=(owner:string,kind:ModelKind)=>`${owner}:${kind}`;
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes))}
function bytes(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
async function masterKey(){const secret=env.MODEL_CONFIG_ENCRYPTION_KEY;if(!secret)throw new Error('API Key 安全存储尚未就绪，请稍后重试。');return crypto.subtle.importKey('raw',bytes(secret),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function encrypt(key:string,id:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},await masterKey(),new TextEncoder().encode(key));return `${base64(iv)}.${base64(new Uint8Array(cipher))}`}
async function decrypt(cipher:string,id:string){const [iv,data]=cipher.split('.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(id)},await masterKey(),bytes(data));return new TextDecoder().decode(plain)}
const columns='id,name,kind,provider,model,endpoint,key_ciphertext,updated_at';
async function row(owner:string,id:string){return database().prepare(`SELECT ${columns} FROM model_connections WHERE id=? AND owner=?`).bind(id,owner).first<Row>()}
function endpointOf(saved:Row){return saved.endpoint||providerPresets[saved.provider].endpoint}
function summary(saved:Row):ModelConnectionSummary{return {id:saved.id,name:saved.name||`${providerPresets[saved.provider].name} · ${saved.kind==='ocr'?'OCR':'文案'}`,kind:saved.kind,provider:saved.provider,model:saved.model,endpoint:endpointOf(saved),updatedAt:saved.updated_at}}
async function selectedRow(owner:string,kind:ModelKind){
 const selection=await database().prepare('SELECT connection_id FROM model_selections WHERE id=? AND owner=?').bind(roleId(owner,kind),owner).first<{connection_id:string|null}>();
 // Legacy IDs and encryption context remain unchanged; no key backfill needed.
 const id=selection?selection.connection_id:roleId(owner,kind);
 const saved=id?await row(owner,id):null;
 return saved&&supportsModelKind(saved,kind)?saved:null;
}
export async function getModelStatuses(owner:string):Promise<ModelStatus[]>{return Promise.all((['ocr','copy'] as const).map(async kind=>{const saved=await selectedRow(owner,kind);return {kind,provider:saved?.provider||defaultProvider,model:saved?.model||defaultModel(defaultProvider,kind),endpoint:saved?endpointOf(saved):undefined,name:saved?summary(saved).name:undefined,connectionId:saved?.id,hasKey:!!saved,updatedAt:saved?.updated_at}}))}
export async function getModelConnections(owner:string){const result=await database().prepare(`SELECT ${columns} FROM model_connections WHERE owner=? ORDER BY updated_at DESC,id`).bind(owner).all<Row>();return result.results.map(summary)}
export async function getModelConfiguration(owner:string){const [settings,connections]=await Promise.all([getModelStatuses(owner),getModelConnections(owner)]);return {settings,connections}}
async function connection(saved:Row):Promise<Connection>{return {provider:saved.provider,model:saved.model,endpoint:endpointOf(saved),name:summary(saved).name,key:await decrypt(saved.key_ciphertext,saved.id)}}
export async function getConnection(owner:string,kind:ModelKind){const saved=await selectedRow(owner,kind);if(!saved)throw new Error(`请先在“模型与 API”中选择${kind==='ocr'?' OCR':'文案生成'}使用的连接。`);return connection(saved)}
export async function getConnectionById(owner:string,id:string,kind:ModelKind){const saved=await row(owner,id);if(!saved)throw new Error('连接不存在或无访问权限。');if(!supportsModelKind(saved,kind))throw new Error('此连接未配置为支持该任务。');return connection(saved)}
function preparedEndpoint(value:string){if(value.replace(/\/+$/,'')===providerPresets.ocrspace.endpoint)return providerPresets.ocrspace.endpoint;return normalizeModelEndpoint(value)}
function preparedFields(input:{kind:ConnectionKind;endpoint:string}){const endpoint=preparedEndpoint(input.endpoint);const provider=providerForEndpoint(endpoint);if(provider==='ocrspace'&&input.kind!=='ocr')throw new Error('此专用 OCR 接口仅支持图片识别。');return {endpoint,provider}}
export async function createConnections(owner:string,input:Extract<Input,{action:'createConnection'}>){
 const {endpoint,provider}=preparedFields(input);const keys=[...new Set(input.apiKeys)];const now=new Date().toISOString();
 const records=await Promise.all(keys.map(async(key,index)=>{const id=`${owner}:connection:${crypto.randomUUID()}`;return {id,name:keys.length>1?`${input.name} ${index+1}`:input.name,cipher:await encrypt(key,id)}}));
 await database().batch(records.map(record=>database().prepare('INSERT INTO model_connections (id,owner,name,kind,provider,model,endpoint,key_ciphertext,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(record.id,owner,record.name,input.kind,provider,input.model,endpoint,record.cipher,now)));
 return {createdCount:records.length};
}
export async function updateConnection(owner:string,input:Extract<Input,{action:'updateConnection'}>){
 const previous=await row(owner,input.id);if(!previous)throw new Error('连接不存在或无访问权限。');
 const {endpoint,provider}=preparedFields(input);
 if(endpoint!==endpointOf(previous)&&!input.apiKey)throw new Error('更换接口地址时，请重新粘贴对应的 API Key。');
 const cipher=input.apiKey?await encrypt(input.apiKey,input.id):previous.key_ciphertext;
 await database().batch([
  database().prepare('UPDATE model_connections SET name=?,kind=?,provider=?,model=?,endpoint=?,key_ciphertext=?,updated_at=? WHERE id=? AND owner=?').bind(input.name,input.kind,provider,input.model,endpoint,cipher,new Date().toISOString(),input.id,owner),
  database().prepare('UPDATE model_selections SET connection_id=NULL WHERE owner=? AND connection_id=? AND ? != ? AND kind != ?').bind(owner,input.id,input.kind,'both',input.kind),
 ]);
}
export async function deleteConnection(owner:string,id:string){
 if(!await row(owner,id))throw new Error('连接不存在或无访问权限。');
 await database().batch([database().prepare('UPDATE model_selections SET connection_id=NULL WHERE owner=? AND connection_id=?').bind(owner,id),database().prepare('DELETE FROM model_connections WHERE id=? AND owner=?').bind(id,owner)]);
}
export async function selectConnection(owner:string,kind:ModelKind,id:string|null){
 if(id){const saved=await row(owner,id);if(!saved)throw new Error('连接不存在或无访问权限。');if(!supportsModelKind(saved,kind))throw new Error('请选择支持此任务的连接。')}
 await database().prepare('INSERT INTO model_selections (id,owner,kind,connection_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET connection_id=excluded.connection_id').bind(roleId(owner,kind),owner,kind,id).run();
}
export async function saveModel(owner:string,input:Extract<Input,{action:'save'}>){
 const {kind,provider,model,apiKey}=input;if(!provider||!model||!(providerPresets[provider].kinds as readonly string[]).includes(kind))throw new Error('请选择适用于此任务的模型服务。');
 const endpoint=provider==='custom'?preparedEndpoint(input.endpoint||''):providerPresets[provider].endpoint;const id=roleId(owner,kind);const previous=await row(owner,id);
 if(!apiKey&&(!previous||endpointOf(previous)!==endpoint))throw new Error('首次配置或更换服务地址时，请粘贴对应接口的 API Key。');
 const cipher=apiKey?await encrypt(apiKey,id):previous!.key_ciphertext;
 await database().prepare('INSERT INTO model_connections (id,owner,name,kind,provider,model,endpoint,key_ciphertext,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,endpoint=excluded.endpoint,key_ciphertext=excluded.key_ciphertext,updated_at=excluded.updated_at').bind(id,owner,`${providerPresets[provider].name} · ${kind==='ocr'?'OCR':'文案'}`,kind,provider,model,endpoint,cipher,new Date().toISOString()).run();
 await selectConnection(owner,kind,id);
}
export async function deleteModel(owner:string,kind:ModelKind){const saved=await selectedRow(owner,kind);if(saved)await deleteConnection(owner,saved.id);await selectConnection(owner,kind,null)}
