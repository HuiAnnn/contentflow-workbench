import {modelErrorDetails} from '@/lib/model-errors';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {recognizeImage} from '@/lib/model-service';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){try{const user=await getChatGPTUser();if(!user)return json({error:'请先登录'},401);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);if(Number(request.headers.get('Content-Length')||0)>5*1024*1024)return json({error:'图片请控制在 4 MB 内。'},413);const form=await request.formData();const file=form.get('image');if(!(file instanceof File))return json({error:'请选择需要识别的图片。'},400);return json(await recognizeImage(user.userId,file))}catch(e){return json({error:e instanceof Error?e.message:'图片识别失败，请重试。',...modelErrorDetails(e)},400)}}
