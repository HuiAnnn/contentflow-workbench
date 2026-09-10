import {headers} from 'next/headers';
import {getChatGPTUser} from './chatgpt-auth';
import {readVisitorSession} from '@/lib/visitor-session';

export async function getWorkspaceIdentity() {
  const account = await getChatGPTUser();
  if (account) return {userId:account.userId, mode:'account' as const};
  const userId = await readVisitorSession((await headers()).get('cookie'));
  return userId ? {userId, mode:'guest' as const} : null;
}
