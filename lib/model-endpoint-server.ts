import {normalizeModelEndpoint} from './model-endpoint';

export function isPublicModelAddress(address:string){
 if(address.includes(':')){
  let canonical:string;try{canonical=new URL(`https://[${address}]/`).hostname.slice(1,-1)}catch{return false}
  const [first,second]=canonical.split(':').map(part=>parseInt(part||'0',16));
  return first>=0x2000&&first<=0x3fff&&first!==0x2002&&first!==0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8));
 }
 if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))return false;
 const octets=address.split('.').map(Number);
 if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=octets;
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88&&c===99))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
async function publicDNS(host:string){
 // Resolve only the public hostname through HTTPS; API keys and request data
 // are never attached to these requests. Both record families must be checked.
 const results=await Promise.all(['A','AAAA'].map(async type=>{
  const response=await fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:'application/dns-json'},redirect:'manual',signal:AbortSignal.timeout(5000)});
  if(!response.ok){await response.body?.cancel();throw new Error('DNS lookup failed')}
  const data=await response.json() as {Status?:number;Answer?:{type:number;data:string}[]};
  if(data.Status!==0)throw new Error('DNS lookup failed');
  return (data.Answer||[]).filter(record=>record.type===(type==='A'?1:28)).map(record=>record.data);
 }));
 return results.flat();
}
export async function checkedModelEndpoint(input:string,resolver=publicDNS){
 const endpoint=normalizeModelEndpoint(input);
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try {
  const addresses=await Promise.race([resolver(new URL(endpoint).hostname),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('DNS timeout')),5000)})]);
  if(!addresses.length)throw new Error('No DNS records');
  if(addresses.some(address=>!isPublicModelAddress(address)))throw new Error('Private DNS result');
  return endpoint;
 }catch{throw new Error('无法确认自定义接口的公网地址，请检查域名解析与服务可用性。')}finally{clearTimeout(timeout)}
}
