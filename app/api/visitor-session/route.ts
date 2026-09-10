import {getWorkspaceIdentity} from '@/app/workspace-identity';
import {createVisitorSession, serializeVisitorCookie} from '@/lib/visitor-session';

export async function POST(request:Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin!==new URL(request.url).origin) || request.headers.get('sec-fetch-site')==='cross-site') {
    return Response.json({error:'请求来源无效'}, {status:403});
  }
  const responseHeaders:Record<string,string> = {'Cache-Control':'private, no-store','Vary':'Cookie'};
  try {
    const existing = await getWorkspaceIdentity();
    if (existing) return Response.json({mode:existing.mode}, {headers:responseHeaders});
    const session = await createVisitorSession();
    responseHeaders['Set-Cookie'] = serializeVisitorCookie(session.token, new URL(request.url).protocol==='https:');
    return Response.json({mode:'guest'}, {headers:responseHeaders});
  } catch {
    return Response.json({error:'工作区暂时无法打开，请稍后重试。'}, {status:503, headers:responseHeaders});
  }
}
