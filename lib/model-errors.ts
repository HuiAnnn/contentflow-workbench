import {providerPresets,type Provider} from './model-presets';

export class ModelProviderError extends Error {
 constructor(message:string,public provider:Provider,public upstreamStatus:number,public providerCode:string|null,public retryAfterSeconds:number){super(message);this.name='ModelProviderError'}
}

// Only interpret documented codes. Provider messages may contain request data
// or credentials, so neither UI responses nor logs include the raw body.
const zhipuErrors:Record<string,{message:string;temporary?:boolean}>={
 '1000':{message:'API Key 身份验证失败，请检查配置。'},
 '1001':{message:'模型接口未收到认证信息，请检查 API 配置。'},
 '1003':{message:'API 认证已过期，请更新 Key。'},
 '1005':{message:'账户要求二次认证，请前往智谱控制台处理。'},
 '1113':{message:'智谱返回账户欠费，请在控制台核对账户状态；稍后重试不能解决此问题。'},
 '1210':{message:'模型调用参数有误，请检查模型配置。'},
 '1211':{message:'模型不存在，请检查模型 ID。'},
 '1220':{message:'当前 API Key 无权访问此模型，请检查模型权限。'},
 '1301':{message:'模型服务拒绝处理本次内容，请核对商品资料后再试。'},
 '1302':{message:'智谱账户的并发或请求频率已达上限。请等待当前请求结束，并在智谱控制台查看此模型的速率限制。',temporary:true},
 '1305':{message:'智谱当前模型服务繁忙，请等待后重试；这是平台负载限制。',temporary:true},
 '1308':{message:'智谱账户已达到使用上限，请在控制台查看额度重置时间。'},
 '1309':{message:'智谱返回编程套餐已到期，请检查 Key 类型与账户状态。'},
 '1310':{message:'智谱账户已达到周或月使用上限，请在控制台查看重置时间。'},
 '1311':{message:'当前智谱套餐没有此模型的访问权限，请检查 Key 类型与模型配置。'},
 '1313':{message:'智谱账户触发了使用策略限制，请在控制台查看详情。'},
 '1314':{message:'智谱企业套餐已失效，请联系账户管理员。'},
 '1315':{message:'此 Key 仅适用于企业编程套餐，请改用通用模型 API Key。'},
};

export function retrySeconds(value:string|null,now=Date.now()){
 if(!value)return 30;
 const seconds=/^\d+(?:\.\d+)?$/.test(value.trim())?Number(value):Math.ceil((Date.parse(value)-now)/1000);
 return Number.isFinite(seconds)?Math.max(1,Math.min(86400,Math.ceil(seconds))):30;
}

async function boundedErrorBody(response:Response){
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let length=0;
 try {
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192)return null;chunks.push(value)}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder().decode(bytes)) as {error?:{code?:unknown}};
 }catch{return null}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}

export async function providerResponseError(provider:Provider,response:Response){
 const body=await boundedErrorBody(response);
 const rawCode=body?.error?.code;
 const code=provider==='zhipu'&&/^[0-9]{4}$/.test(String(rawCode))?String(rawCode):null;
 let known=code?zhipuErrors[code]:undefined;
 if(code&&/^13(16|17|18|19|20|21)$/.test(code))known={message:'智谱账户已达到使用或消费上限，请在控制台查看重置时间及账户限额。'};
 const status=response.status;
 const message=known?.message||(status===401||status===403?'API Key 无效或无访问权限，请检查配置。':status===429?'模型服务暂时拒绝请求（HTTP 429），未提供可识别的具体原因。请稍后重试或在服务商控制台检查限制。':status===402?'账户余额或可用额度不足，请检查服务商控制台。':status===404?'找不到此模型，请检查模型 ID 或免费模型是否仍可用。':`模型服务返回错误（HTTP ${status}），未修改商品内容。`);
 const wait=known?(known.temporary?retrySeconds(response.headers.get('Retry-After')):0):status===429?retrySeconds(response.headers.get('Retry-After')):0;
 console.error(JSON.stringify({event:'model_provider_error',provider,httpStatus:status,code}));
 return new ModelProviderError(`${providerPresets[provider].name}：${message}${code?`（错误码 ${code}）`:''}`,provider,status,code,wait);
}

export function modelErrorDetails(error:unknown){return error instanceof ModelProviderError?{providerCode:error.providerCode,upstreamStatus:error.upstreamStatus,retryAfterSeconds:error.retryAfterSeconds}:{}}
