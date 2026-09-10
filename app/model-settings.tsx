'use client';
import {useState,type FormEvent} from 'react';
import {KeyRound,ScanText,Sparkles,ShieldCheck,Plus,PlugZap,Trash2,ArrowLeft,Pencil,Copy,Eye,EyeOff,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {supportsModelKind,providerPresets,type ModelKind,type ModelStatus,type ConnectionKind,type ModelConfiguration,type ModelConnectionSummary} from '@/lib/model-presets';
import {normalizeModelEndpoint} from '@/lib/model-endpoint';
import {toast} from 'sonner';

type ApiResult=ModelConfiguration&{createdCount?:number;message?:string;elapsedMs?:number;error?:string};
async function configure(payload:unknown){
 const response=await fetch('/api/model-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const data=await response.json() as ApiResult;
 if(!response.ok)throw new Error(data.error||'操作失败，请重试。');
 return data;
}
const usage=(kind:ConnectionKind)=>kind==='both'?'文案 + 图片':kind==='ocr'?'图片识别':'文案生成';
const host=(endpoint:string)=>{try{return new URL(endpoint).host}catch{return endpoint}};
type Editor={mode:'create'|'edit';seed?:ModelConnectionSummary};

export default function ModelSettings({settings,connections,onUpdate,onBack}:{settings:ModelStatus[];connections:ModelConnectionSummary[];onUpdate:(config:ModelConfiguration)=>void;onBack?:()=>void}){
 const [editor,setEditor]=useState<Editor|null>(null);
 const [deleting,setDeleting]=useState<ModelConnectionSummary|null>(null);
 const [pending,setPending]=useState('');
 const [error,setError]=useState('');
 const [testResult,setTestResult]=useState<{id:string;error:boolean;text:string}|null>(null);
 const perform=async(payload:unknown,operation:string)=>{
  if(pending)return;setPending(operation);setError('');
  try{const data=await configure(payload);onUpdate(data);return data}
  catch(e){setError(e instanceof Error?e.message:'操作失败，请重试。')}
  finally{setPending('')}
 };
 const test=async(connection:ModelConnectionSummary,kind:ModelKind)=>{
  if(pending)return;setPending(`test:${connection.id}:${kind}`);setTestResult(null);setError('');
  try{const data=await configure({action:'testConnection',id:connection.id,kind});onUpdate(data);setTestResult({id:connection.id,error:false,text:`${kind==='ocr'?'图片':'文案'}测试：${data.message||'连接成功。'}${typeof data.elapsedMs==='number'?` 耗时 ${(data.elapsedMs/1000).toFixed(2)} 秒。`:''}`})}
  catch(e){setTestResult({id:connection.id,error:true,text:e instanceof Error?e.message:'连接测试失败，请重试。'})}
  finally{setPending('')}
 };
 return <div className="models-page connections-page">
  {onBack&&<button className="task-back" onClick={onBack}><ArrowLeft size={17}/>返回内容任务</button>}
  <header className="connections-heading"><div><span className="eyebrow">AI CONNECTIONS</span><h1>API 连接</h1><p>把常用的 Key 放在一起，按任务选择使用哪一组。</p></div><Button className="apple-button primary" disabled={!!pending} onClick={()=>setEditor({mode:'create'})}><Plus size={17}/>添加连接</Button></header>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <div className="connection-assignments">
   {(['copy','ocr'] as const).map(kind=>{const active=settings.find(s=>s.kind===kind);const available=connections.filter(c=>supportsModelKind(c,kind));return <section className="panel assignment-card" key={kind}>
    <div className="assignment-heading"><span className={`config-icon ${kind==='copy'?'purple':'blue'}`}>{kind==='copy'?<Sparkles size={23}/>:<ScanText size={23}/>}</span><div><h2>{kind==='copy'?'商品文案生成':'OCR 图片识别'}</h2><p>{kind==='copy'?'标题、卖点、描述与关键词':'包装图片、参数表与资料截图'}</p></div></div>
    <label className="assignment-select"><span>使用的连接</span><Select value={active?.connectionId||'none'} disabled={!!pending} onValueChange={async value=>{const data=await perform({action:'selectConnection',kind,connectionId:value==='none'?null:value},`select:${kind}`);if(data)toast.success(value==='none'?'已取消选择':'已切换任务连接')}}><SelectTrigger aria-label={`${kind==='copy'?'文案生成':'图片识别'}使用的连接`}><SelectValue placeholder="选择一条连接"/></SelectTrigger><SelectContent><SelectItem value="none">未选择</SelectItem>{available.map(c=><SelectItem key={c.id} value={c.id}>{c.name} · {c.model}</SelectItem>)}</SelectContent></Select></label>
    <small>{active?.hasKey?`当前模型：${active.model}`:available.length?'从列表选择一条连接后即可使用。':'先添加一条支持此用途的连接。'}{kind==='ocr'&&' 图片识别需要视觉模型。'}</small>
   </section>})}
  </div>
  <section className="panel connections-list" aria-labelledby="connections-title">
   <div className="connections-list-heading"><div><h2 id="connections-title">我的连接 <span>{connections.length}</span></h2><p>同一接口可以保存多个 Key，点击「加 Key」复用地址和模型。</p></div><span className="connection-encryption"><ShieldCheck size={16}/>Key 加密保存</span></div>
   {!connections.length?<div className="connections-empty"><span><KeyRound size={27}/></span><h3>添加第一条连接</h3><p>填写接口地址、模型和 Key。同一接口的多个 Key 可以按行批量粘贴。</p><Button variant="outline" className="apple-button" onClick={()=>setEditor({mode:'create'})}><Plus size={16}/>添加连接</Button></div>:<div className="connections-table-scroll"><table className="connections-table"><thead><tr><th>连接名称 / 接口</th><th>模型与用途</th><th>使用状态</th><th>操作</th></tr></thead><tbody>{connections.map(c=>{const selected=settings.filter(s=>s.connectionId===c.id);const result=testResult?.id===c.id?testResult:null;return <ConnectionRow key={c.id} connection={c} selected={selected} result={result} pending={pending} onTest={kind=>test(c,kind)} onEdit={()=>{setError('');setEditor({mode:'edit',seed:c})}} onCopy={()=>{setError('');setEditor({mode:'create',seed:c})}} onDelete={()=>setDeleting(c)}/>})}</tbody></table></div>}
  </section>
  <p className="connections-footnote">测试连接会发送一条测试文本或图片，可能使用少量模型额度。实际图片与文案分别使用上方选定的连接。</p>
  {editor&&<ConnectionEditor key={`${editor.mode}:${editor.seed?.id||'new'}`} editor={editor} onClose={()=>setEditor(null)} onSaved={data=>{onUpdate(data);setEditor(null);setTestResult(null);toast.success(editor.mode==='edit'?'连接已更新':`已添加 ${data.createdCount||1} 条连接，可在上方选择使用`)}}/>}
  <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open)setDeleting(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>这条连接和保存的 Key 会被删除。正在使用它的任务将需要重新选择连接，已有商品资料和内容会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={async()=>{if(!deleting)return;const data=await perform({action:'deleteConnection',id:deleting.id},`delete:${deleting.id}`);if(data){setTestResult(null);toast.success('连接已删除')}}}>删除连接</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>
}

function ConnectionRow({connection:c,selected,result,pending,onTest,onEdit,onCopy,onDelete}:{connection:ModelConnectionSummary;selected:ModelStatus[];result:{error:boolean;text:string}|null;pending:string;onTest:(kind:ModelKind)=>void;onEdit:()=>void;onCopy:()=>void;onDelete:()=>void}){
 return <><tr><td><div className="connection-name"><KeyRound size={17}/><strong>{c.name}</strong></div><span className="connection-endpoint" title={c.endpoint}>{host(c.endpoint)}</span><small className="connection-key-state">•••••••• · 已保存</small></td><td><code>{c.model}</code><small>{usage(c.kind)}</small></td><td><div className="connection-badges">{selected.length?selected.map(s=><span key={s.kind} className="status blue"><Check size={12}/>{s.kind==='ocr'?'图片默认':'文案默认'}</span>):<span className="status gray">未选用</span>}</div></td><td><div className="connection-row-actions">
  {(['copy','ocr'] as const).filter(kind=>supportsModelKind(c,kind)).map(kind=><Button key={kind} variant="ghost" className="connection-action" disabled={!!pending} onClick={()=>onTest(kind)} aria-label={`测试${c.name}的${kind==='ocr'?'图片识别':'文案生成'}`}><PlugZap size={15}/>{pending===`test:${c.id}:${kind}`?'测试中…':c.kind==='both'?(kind==='ocr'?'测图片':'测文案'):'测试'}</Button>)}
  <Button variant="ghost" className="connection-action" disabled={!!pending} onClick={onCopy} aria-label={`为${c.name}添加另一个 Key`}><Copy size={15}/>加 Key</Button><Button variant="ghost" className="connection-action icon-only" disabled={!!pending} onClick={onEdit} aria-label={`编辑${c.name}`} title="编辑连接"><Pencil size={16}/></Button><Button variant="ghost" className="connection-action icon-only" disabled={!!pending} onClick={onDelete} aria-label={`删除${c.name}`} title="删除连接"><Trash2 size={16}/></Button>
 </div></td></tr>{result&&<tr className="connection-result-row"><td colSpan={4}><p className={result.error?'inline-error':'inline-success'} role={result.error?'alert':'status'}>{result.text}</p></td></tr>}</>
}

function ConnectionEditor({editor,onClose,onSaved}:{editor:Editor;onClose:()=>void;onSaved:(data:ApiResult)=>void}){
 const {mode,seed}=editor;const editing=mode==='edit';
 const [name,setName]=useState(seed?(editing?seed.name:`${seed.name.slice(0,60)} 副本`):'');
 const [endpoint,setEndpoint]=useState(seed?.endpoint||'');const [model,setModel]=useState(seed?.model||'');
 const [copy,setCopy]=useState(!seed||seed.kind!=='ocr');const [ocr,setOcr]=useState(!!seed&&seed.kind!=='copy');
 const [keys,setKeys]=useState('');const [visible,setVisible]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
 let normalized='';try{normalized=endpoint.replace(/\/+$/,'')===providerPresets.ocrspace.endpoint?providerPresets.ocrspace.endpoint:normalizeModelEndpoint(endpoint)}catch{}
 const keyList=[...new Set(keys.split(/\r?\n/).map(k=>k.trim()).filter(Boolean))];
 const changedDestination=editing&&normalized!==seed?.endpoint;
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(pending)return;setError('');
  if(!copy&&!ocr){setError('请至少选择一种用途。');return}
  if(!normalized){setError('请填写有效的 HTTPS 模型接口地址。');return}
  if(!keyList.length&&(!editing||changedDestination)){setError(changedDestination?'更换接口地址后，请重新粘贴对应的 Key。':'请至少粘贴一个 API Key。');return}
  if(keyList.length>(editing?1:50)){setError(editing?'编辑时只能替换一个 Key。批量添加请使用「加 Key」。':'每次最多添加 50 个 Key。');return}
  setPending(true);
  try{const kind:ConnectionKind=copy&&ocr?'both':ocr?'ocr':'copy';const fields={name,endpoint:normalized,model,kind};const data=await configure(editing?{action:'updateConnection',id:seed!.id,...fields,...(keyList.length?{apiKey:keyList[0]}:{})}:{action:'createConnection',...fields,apiKeys:keyList});setKeys('');onSaved(data)}
  catch(e){setError(e instanceof Error?e.message:'保存失败，请重试。')}
  finally{setPending(false)}
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose()}}><DialogContent className="connection-editor" showCloseButton={!pending}><DialogHeader><DialogTitle>{editing?'编辑连接':seed?'添加其他 Key':'添加 API 连接'}</DialogTitle><DialogDescription>{editing?'地址和模型可以修改；Key 留空则保留已保存的凭证。':seed?'已带入接口地址和模型，粘贴新的 Key 即可添加。':'无需选择厂商。首次填写接口与模型，之后可以直接复用。'}</DialogDescription></DialogHeader>
  <form onSubmit={submit} autoComplete="off"><div className="connection-form-fields">
   <label>连接名称<input required maxLength={70} value={name} disabled={pending} onChange={e=>setName(e.target.value)} placeholder="例如：文案主用 / 图片识别备用"/></label>
   <div className="connection-address-model"><label>接口地址<input required type="url" value={endpoint} maxLength={2048} disabled={pending} onChange={e=>setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false}/></label><label>模型 ID<input required value={model} maxLength={160} disabled={pending} onChange={e=>setModel(e.target.value)} placeholder="服务商提供的模型名称" autoComplete="off" spellCheck={false}/></label></div>
   <p className="connection-field-help">支持 Chat Completions 兼容接口，可填写 Base URL 或完整请求地址。Key 本身不包含接口地址和模型信息。</p>
   <fieldset><legend>用于哪些任务</legend><div className="connection-capabilities"><label><Checkbox checked={copy} disabled={pending} onCheckedChange={v=>setCopy(v===true)}/><Sparkles size={16}/>文案生成</label><label><Checkbox checked={ocr} disabled={pending} onCheckedChange={v=>setOcr(v===true)}/><ScanText size={16}/>图片识别</label></div>{ocr&&<p className="connection-field-help">请选择支持图片输入的视觉模型，保存后可使用「测试」确认是否可用。</p>}</fieldset>
   <div className="connection-keys"><div className="connection-keys-label"><label htmlFor="connection-api-keys">{editing?'替换 API Key（可选）':'API Key'}</label><Button type="button" variant="ghost" className="connection-action" onClick={()=>setVisible(!visible)} aria-label={visible?'隐藏输入的 Key':'显示输入的 Key'}>{visible?<EyeOff size={16}/>:<Eye size={16}/>} {visible?'隐藏':'显示'}</Button></div>
    {editing?<input id="connection-api-keys" type={visible?'text':'password'} value={keys} maxLength={4096} disabled={pending} onChange={e=>setKeys(e.target.value)} placeholder="已保存，留空保留原 Key" autoComplete="new-password" spellCheck={false}/>:<textarea id="connection-api-keys" className={visible?'':'keys-masked'} rows={4} value={keys} maxLength={205000} disabled={pending} onChange={e=>setKeys(e.target.value)} placeholder="粘贴 Key，每行一个" autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off"/>}
    <p className="connection-field-help">{editing?(changedDestination?'接口地址已改变，请重新输入对应的 Key。':'服务端加密保存，页面不会读取完整 Key。'):`同一接口与模型的 Key 每行一个，最多 50 个。${keyList.length?`已输入 ${keyList.length} 个，重复行已合并。`:''}`}</p>
   </div>
  </div>{error&&<p className="inline-error" role="alert">{error}</p>}<DialogFooter><Button type="button" variant="outline" className="apple-button" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" className="apple-button primary" disabled={pending}>{pending?'正在保存…':editing?'保存修改':keyList.length>1?`保存 ${keyList.length} 条连接`:'保存到列表'}</Button></DialogFooter></form>
 </DialogContent></Dialog>
}
