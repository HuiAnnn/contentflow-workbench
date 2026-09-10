import {env} from 'cloudflare:workers';

export const visitorCookieName = 'contentflow_visitor';
export const visitorMaxAge = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

async function signingKey() {
  const secret = env.MODEL_CONFIG_ENCRYPTION_KEY;
  if (!secret) throw new Error('工作区暂时无法打开，请稍后重试。');
  // Domain-separated from credential encryption; the master key stays server-side.
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}

function signingInput(payload:string) {
  return encoder.encode(`contentflow-visitor-session:${payload}`);
}

function encode(bytes:Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

export async function createVisitorSession() {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
  const expires = Math.floor(Date.now()/1000) + visitorMaxAge;
  const payload = `v1.${id}.${expires}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), signingInput(payload));
  return {token:`${payload}.${encode(new Uint8Array(signature))}`, userId:`guest:${id}`};
}

export async function readVisitorSession(cookieHeader:string|null):Promise<string|null> {
  const values = (cookieHeader||'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(`${visitorCookieName}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(visitorCookieName.length+1);
  const match = /^v1\.([a-f0-9]{64})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const expires = Number(match[2]);
  const now = Math.floor(Date.now()/1000);
  if (expires <= now || expires > now+visitorMaxAge+60) return null;
  const signature = Uint8Array.from(atob(match[3].replaceAll('-','+').replaceAll('_','/')+'='), c=>c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', await signingKey(), signature, signingInput(`v1.${match[1]}.${match[2]}`));
  return valid ? `guest:${match[1]}` : null;
}

export function serializeVisitorCookie(token:string, secure:boolean) {
  return `${visitorCookieName}=${token}; Path=/; Max-Age=${visitorMaxAge}; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
}
