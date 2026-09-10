import {z} from 'zod';
import {Product,Workspace,ContentVersion,makeVersions,moduleNames,packageValid,selectedModules} from './workflow';
const common={id:z.string().min(1).max(100)};
const field=z.object({name:z.string().min(1).max(80),value:z.string().max(2000),source:z.string().max(3000),confirmed:z.boolean()});
export const commandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),source:z.string().min(3).max(40000),owner:z.enum(['陈思思','张夏明','梁欣','董莹莹'])}),
 z.object({action:z.literal('fields'),...common,fields:z.array(field).min(2).max(50)}),
 z.object({action:z.literal('generate'),...common}),
 z.object({action:z.literal('aiGenerate'),...common}),
 z.object({action:z.literal('publish'),...common}),
 z.object({action:z.literal('choose'),...common,module:z.enum(['商品标题','核心卖点','商品描述','SEO 关键词','设计需求']),versionId:z.string().max(100)}),
 z.object({action:z.literal('chooseVersion'),...common,versionId:z.string().max(100)}),
 z.object({action:z.literal('edit'),...common,modules:z.record(z.string().min(1).max(10000))}),
 z.object({action:z.literal('design'),...common,required:z.boolean()}),
 z.object({action:z.literal('deliver'),...common,url:z.string().url().max(2000)}),
 z.object({action:z.literal('submit'),...common}),
 z.object({action:z.literal('approve'),...common}),
 z.object({action:z.literal('reject'),...common,reason:z.string().min(2).max(1000)}),
 z.object({action:z.literal('export'),ids:z.array(z.string().max(100)).min(1).max(100)}),
 z.object({action:z.literal('batch'),operation:z.enum(['generate','submit','approve']),ids:z.array(z.string().max(100)).min(1).max(100)})
]);
export type Command=z.infer<typeof commandSchema>;
export function fieldsReady(p:Product){return p.fields.every(f=>f.confirmed&&f.value.trim())&&['商品名称','类目'].every(n=>p.fields.some(f=>f.name===n&&f.confirmed&&f.value.trim()))}
export function eligibility(p:Product,op:string):string|null{
 if(op==='generate')return !fieldsReady(p)?'商品字段尚未全部确认':!['generate','failed'].includes(p.stage)?'当前阶段无需重新生成':null;
 if(op==='submit')return !packageValid(p)?'内容未选齐或引用了旧资料':!fieldsReady(p)?'商品字段尚未确认':p.designRequired&&!p.designDelivered?'设计尚未交付':p.stage==='review'?'已在审核队列中':['ready','exported','published'].includes(p.stage)?'当前版本已审核通过':null;
 if(op==='approve')return p.stage!=='review'?'当前不在审核阶段':!packageValid(p)||!fieldsReady(p)?'内容或字段需要重新核对':p.designRequired&&!p.designDelivered?'设计尚未交付':null;
 if(op==='export'||op==='publish')return !['ready','exported','published'].includes(p.stage)||p.approvedRevision!==p.packageRevision?'当前内容版本尚未审核通过':!fieldsReady(p)||!packageValid(p)?'内容引用已过期':p.designRequired&&!p.designDelivered?'设计尚未交付':null;
 return '不支持此操作';
}
export function parseSource(source:string){
 const aliases:Record<string,string>={'名称':'商品名称','品名':'商品名称','产品名':'商品名称','产品名称':'商品名称','商品名':'商品名称','分类':'类目','类别':'类目','商品分类':'类目','产品类别':'类目'};
 const found=source.split(/\r?\n/).filter(l=>/[：:]/.test(l)).map(l=>{const index=l.search(/[：:]/);const raw=l.slice(0,index).trim().replace(/^[-*•\d.、\s]+/,'');return {name:aliases[raw]||raw,value:l.slice(index+1).trim(),source:l.trim(),confirmed:false}}).filter(f=>f.name&&f.name.length<=80&&f.value&&f.value.length<=2000);
 const fields:typeof found=[];for(const field of found){const old=fields.find(f=>f.name===field.name);if(old){if(old.value!==field.value){old.value='';old.source=(old.source+'；另有冲突来源：'+field.source).slice(0,3000)}}else fields.push(field)}
 for(const name of ['商品名称','类目'])if(!fields.some(f=>f.name===name))fields.unshift({name,value:'',source:'未从资料中识别，请核对原文后补充',confirmed:false});
 if(fields.length>50)throw new Error('单件商品最多支持 50 个字段。');return fields;
}
export function attachAIResult(original:Workspace,id:string,versions:{label:string;modules:Record<string,string>}[],engine:string,elapsedMs?:number){
 const w=structuredClone(original);const p=w.products.find(p=>p.id===id);if(!p)throw new Error('商品不存在');const reason=eligibility(p,'generate');if(reason)throw new Error(reason);const at=new Date().toISOString();const created:ContentVersion[]=versions.map(v=>({...v,id:crypto.randomUUID(),fieldRevision:p.fieldRevision,fieldsSnapshot:structuredClone(p.fields),engine,elapsedMs,at}));p.versions.push(...created);p.selection=Object.fromEntries(moduleNames.map(n=>[n,created[0].id]));p.approvedRevision=null;p.packageRevision++;p.designDelivered=false;p.stage=p.designRequired?'design':'generate';p.updated=at;p.history.unshift({at,text:`已通过 ${engine} 生成 3 个内容版本，待人工审核`});w.revision++;return {workspace:w,result:{engine,elapsedMs}};
}
export function applyCommand(original:Workspace,cmd:Command){const w=structuredClone(original);let result:Record<string,unknown>={};const at=new Date().toISOString();const log=(p:Product,text:string)=>{p.updated=at;p.history.unshift({at,text})};const invalidate=(p:Product)=>{p.approvedRevision=null;p.packageRevision++;p.designDelivered=false;p.stage=p.designRequired?'design':'generate'};
 const run=(p:Product,operation:'generate'|'submit'|'approve')=>{const reason=eligibility(p,operation);if(reason)throw new Error(reason);if(operation==='generate'){const v=makeVersions(p);p.versions.push(...v);p.selection=Object.fromEntries(moduleNames.map(n=>[n,v[0].id]));invalidate(p);log(p,'根据已确认字段生成 3 个模板版本（未调用 AI）')}if(operation==='submit'){p.stage='review';log(p,`内容包 v${p.packageRevision} 已提交审核`)}if(operation==='approve'){p.stage='ready';p.approvedRevision=p.packageRevision;log(p,`内容包 v${p.packageRevision} 审核通过（预览工作区）`)}};
 if(cmd.action==='create'){const fields=parseSource(cmd.source);const p:Product={id:crypto.randomUUID(),name:fields.find(f=>f.name==='商品名称')!.value||'未命名商品',category:fields.find(f=>f.name==='类目')!.value||'待补充',sku:`CF-${Date.now().toString(36).toUpperCase()}`,owner:cmd.owner,image:'',stage:'confirm',fields,fieldRevision:1,versions:[],selection:{},packageRevision:1,approvedRevision:null,history:[],source:cmd.source,updated:at,designRequired:false,designDelivered:false,due:'未设置'};w.products.unshift(p);log(p,'已导入商品资料，等待人工核验');result={id:p.id};}
 else if(cmd.action==='export'){const exports=[];for(const id of new Set(cmd.ids)){const p=w.products.find(p=>p.id===id);if(!p)throw new Error('商品不存在');const reason=eligibility(p,'export');if(reason)throw new Error(`${p.name}：${reason}`);exports.push({商品编号:p.sku,商品名称:p.name,内容版本:p.packageRevision,资料版本:p.fieldRevision,...selectedModules(p),导出时间:at});p.lastExportedAt=at;log(p,`已生成内容包 v${p.packageRevision} 导出文件`)}result={exports};}
 else if(cmd.action==='batch'){const outcomes=[];for(const id of new Set(cmd.ids)){const p=w.products.find(p=>p.id===id);if(!p){outcomes.push({id,status:'skipped',reason:'商品不存在'});continue}const reason=eligibility(p,cmd.operation);if(reason)outcomes.push({id,name:p.name,status:'skipped',reason});else{run(p,cmd.operation);outcomes.push({id,name:p.name,status:'done'})}}result={outcomes};}
 else{const p=w.products.find(p=>p.id===cmd.id);if(!p)throw new Error('找不到该商品，请刷新后再试。');
  if(cmd.action==='fields'){if(new Set(cmd.fields.map(f=>f.name)).size!==cmd.fields.length||!['商品名称','类目'].every(n=>cmd.fields.some(f=>f.name===n)))throw new Error('商品名称和类目为必填字段，字段名不能重复。');const changed=JSON.stringify(cmd.fields.map(f=>[f.name,f.value]))!==JSON.stringify(p.fields.map(f=>[f.name,f.value]));const wasReady=fieldsReady(p);p.fields=cmd.fields.map(f=>({...f,source:p.fields.find(old=>old.name===f.name)?.source||'人工补充'}));p.name=p.fields.find(f=>f.name==='商品名称')!.value||'未命名商品';p.category=p.fields.find(f=>f.name==='类目')!.value||'待补充';if(changed){p.fieldRevision++;invalidate(p);p.stage=fieldsReady(p)?'generate':'confirm';log(p,`资料已更新至 v${p.fieldRevision}，旧内容和审核资格失效`)}else{if(!fieldsReady(p)){invalidate(p);p.stage='confirm'}else if(!wasReady||p.stage==='confirm')p.stage='generate';log(p,'已保存字段核验结果')}}
  else if(cmd.action==='publish'){const reason=eligibility(p,'publish');if(reason)throw new Error(reason);if(p.publications?.some(v=>v.packageRevision===p.packageRevision)){p.stage='published';result={url:`/catalog/${encodeURIComponent(p.id)}`}}else{p.publications=[...(p.publications||[]),{id:crypto.randomUUID(),at,packageRevision:p.packageRevision,fieldRevision:p.fieldRevision,name:p.name,category:p.category,sku:p.sku,image:p.image,modules:selectedModules(p),fields:structuredClone(p.fields)}];p.stage='published';log(p,`内容包 v${p.packageRevision} 已发布到本系统商品页`);result={url:`/catalog/${encodeURIComponent(p.id)}`}}}
  else if(cmd.action==='aiGenerate'){throw new Error('AI 生成需要经过模型服务执行')}
  else if(cmd.action==='generate'||cmd.action==='submit'||cmd.action==='approve')run(p,cmd.action);
  else if(cmd.action==='choose'||cmd.action==='chooseVersion'){const v=p.versions.find(v=>v.id===cmd.versionId&&v.fieldRevision===p.fieldRevision);if(!v)throw new Error('该版本引用了旧资料，请重新生成。');if(cmd.action==='choose')p.selection[cmd.module]=v.id;else p.selection=Object.fromEntries(moduleNames.map(n=>[n,v.id]));invalidate(p);log(p,cmd.action==='choose'?`选用「${v.label}」的${cmd.module}`:`选用「${v.label}」整版内容`)}
  else if(cmd.action==='edit'){if(!packageValid(p)||!fieldsReady(p))throw new Error('请先确认字段并生成有效内容版本。');if(!moduleNames.every(n=>!!cmd.modules[n]?.trim()))throw new Error('每个内容模块均需填写。');const v={id:crypto.randomUUID(),label:'人工编辑',fieldRevision:p.fieldRevision,fieldsSnapshot:structuredClone(p.fields),modules:Object.fromEntries(moduleNames.map(n=>[n,cmd.modules[n]])),at};p.versions.push(v);p.selection=Object.fromEntries(moduleNames.map(n=>[n,v.id]));invalidate(p);log(p,'已保存人工编辑版本，需重新审核')}
  else if(cmd.action==='design'){p.designRequired=cmd.required;invalidate(p);log(p,cmd.required?'已启用设计交付流程':'已切换为直接内容审核')}
  else if(cmd.action==='deliver'){if(!p.designRequired||!packageValid(p))throw new Error('请先确认内容并启用设计需求。');if(!cmd.url.startsWith('https://'))throw new Error('请使用 HTTPS 设计交付链接。');p.designDelivered=true;p.stage='generate';log(p,`设计交付参考链接：${cmd.url}`)}
  else if(cmd.action==='reject'){if(p.stage!=='review')throw new Error('只有待审核内容可以退回。');p.stage='generate';p.approvedRevision=null;log(p,`审核退回：${cmd.reason}`)}
 }
 w.revision++;return {workspace:w,result};}
