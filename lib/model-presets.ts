export type ModelKind='ocr'|'copy';
export type Provider='aliyun'|'zhipu'|'gemini'|'openrouter'|'ocrspace'|'custom';
type Preset={name:string;model:string;ocrModel?:string;endpoint:string;kinds:readonly ModelKind[];keyUrl:string;docs:string;note:string;region:'国内'|'海外'|'自定义';badge:string};
export const providerPresets:Record<Provider,Preset>={
 custom:{name:'自定义兼容接口',model:'',endpoint:'',kinds:['ocr','copy'],keyUrl:'',docs:'',region:'自定义',badge:'不限厂商',note:'支持 OpenAI Chat Completions 兼容接口与 Bearer API Key。首次填写地址、模型和 Key；OCR 需选择支持图片输入的视觉模型。'},
 aliyun:{name:'阿里云百炼 · 北京',model:'qwen-flash',ocrModel:'qwen-vl-ocr',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',kinds:['ocr','copy'],keyUrl:'https://bailian.console.aliyun.com/?tab=model#/api-key',docs:'https://help.aliyun.com/zh/model-studio/model-pricing',region:'国内',badge:'日常运营推荐',note:'OCR 使用专用识字模型，文案使用非思考 Flash。按量计费，部分模型有 90 天试用额度；需使用北京地域的百炼 API Key。'},
 zhipu:{name:'智谱开放平台',model:'glm-4.7-flash',ocrModel:'glm-4.6v-flash',endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',kinds:['ocr','copy'],keyUrl:'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',docs:'https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash',region:'国内',badge:'免费试用',note:'Flash 文本与视觉模型免费，默认关闭思考。并发和调用限额以账户为准；免费服务高峰期可能排队，先测试你的实际商品资料。'},
 gemini:{name:'Google Gemini',model:'gemini-3.8-flash',endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',kinds:['ocr','copy'],keyUrl:'https://aistudio.google.com/apikey',docs:'https://ai.google.dev/gemini-api/docs/pricing',region:'海外',badge:'海外备选',note:'部分模型有免费额度，具体限额以 AI Studio 项目为准；中国大陆不在官方支持地区名单内。'},
 openrouter:{name:'OpenRouter',model:'google/gemma-4-31b-it:free',endpoint:'https://openrouter.ai/api/v1/chat/completions',kinds:['ocr','copy'],keyUrl:'https://openrouter.ai/settings/keys',docs:'https://openrouter.ai/google/gemma-4-31b-it:free',region:'海外',badge:'海外备选',note:'此免费模型支持图片和文字；免费路由的限额、供应商与可用性会变化。'},
 ocrspace:{name:'OCR.space',model:'OCR Engine 2 · 中文',endpoint:'https://api.ocr.space/parse/image',kinds:['ocr'],keyUrl:'https://ocr.space/ocrapi/freekey',docs:'https://ocr.space/ocrapi',region:'海外',badge:'海外备选',note:'专用 OCR 服务。免费计划每月 25,000 次，每 IP 每日 500 次；单文件不超过 1 MB。'}
};
export const defaultProvider:Provider='aliyun';
export function defaultModel(provider:Provider,kind:ModelKind){const preset=providerPresets[provider];return kind==='ocr'&&preset.ocrModel?preset.ocrModel:preset.model}
export function modelNote(provider:Provider,kind:ModelKind){if(provider==='aliyun')return kind==='ocr'?'推荐 qwen-vl-ocr：专用文字提取。每百万 Token 输入 ¥0.3、输出 ¥0.5；北京地域有 100 万 Token 试用额度，有效期 90 天。':'推荐 qwen-flash：非思考模式，适合标题、卖点和短描述。单次输入不超过 128K 时，每百万 Token 输入 ¥0.15、输出 ¥1.5；试用额度以控制台为准。';return providerPresets[provider].note}
export type ModelStatus={connectionId?:string;name?:string;kind:ModelKind;provider:Provider;model:string;endpoint?:string;hasKey:boolean;updatedAt?:string};

export type ConnectionKind=ModelKind|'both';
export type ModelConnectionSummary={id:string;name:string;kind:ConnectionKind;provider:Provider;model:string;endpoint:string;updatedAt:string};
export type ModelConfiguration={settings:ModelStatus[];connections:ModelConnectionSummary[]};
export function supportsModelKind(connection:{kind:ConnectionKind;provider:Provider},kind:ModelKind){return (connection.kind==='both'||connection.kind===kind)&&!(connection.provider==='ocrspace'&&kind==='copy')}
export function providerForEndpoint(endpoint:string):Provider{return (Object.keys(providerPresets) as Provider[]).find(p=>p!=='custom'&&providerPresets[p].endpoint===endpoint)||'custom'}
