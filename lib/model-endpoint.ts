// Shared URL parsing for the configuration form and server. Credentials belong
// in the encrypted key field, never in a URL or a redirect target.
export function normalizeModelEndpoint(input:string){
 let url:URL;try{url=new URL(input.trim())}catch{throw new Error('请填写有效的 HTTPS 接口地址。')}
 const hostname=url.hostname.toLowerCase().replace(/\.$/,'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port)throw new Error('接口地址需使用 HTTPS，不能包含账号、密码、查询参数或自定义端口。');
 if(!hostname.includes('.')||hostname.includes(':')||/^[\d.]+$/.test(hostname)||/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hostname))throw new Error('请使用公网服务的域名地址，不支持本机或内网接口。');
 url.hostname=hostname;
 let path=url.pathname.replace(/\/+$/,'');
 if(!path)path='/v1';
 if(!path.endsWith('/chat/completions'))path+='/chat/completions';
 url.pathname=path;
 return url.toString();
}

export function needsNewModelKey(previous:{provider:string;endpoint?:string|null}|null,provider:string,endpoint:string|null){
 return !previous||previous.provider!==provider||(provider==='custom'&&previous.endpoint!==endpoint);
}
