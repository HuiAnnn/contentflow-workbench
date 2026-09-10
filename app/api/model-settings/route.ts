import {modelErrorDetails} from '@/lib/model-errors';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {configurationInput,getModelConfiguration,createConnections,updateConnection,deleteConnection,selectConnection,saveModel,deleteModel} from '@/lib/model-connections';
import {testModel} from '@/lib/model-service';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 try{const user=await getChatGPTUser();if(!user)return json({error:'请先登录'},401);return json(await getModelConfiguration(user.userId))}
 catch{return json({error:'连接列表暂时无法读取，请稍后重试。'},503)}
}
export async function POST(request:Request){
 try{
  const user=await getChatGPTUser();if(!user)return json({error:'请先登录'},401);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
  const body=await request.text();if(body.length>450000)return json({error:'请求内容过长'},413);
  const parsed=configurationInput.safeParse(JSON.parse(body));if(!parsed.success)return json({error:'请检查连接名称、接口地址、模型和 Key，每次最多添加 50 个 Key。'},400);
  const input=parsed.data;let result={};
  switch(input.action){
   case 'createConnection':result=await createConnections(user.userId,input);break;
   case 'updateConnection':await updateConnection(user.userId,input);break;
   case 'deleteConnection':await deleteConnection(user.userId,input.id);break;
   case 'selectConnection':await selectConnection(user.userId,input.kind,input.connectionId);break;
   case 'testConnection':result=await testModel(user.userId,input.kind,input.id);break;
   case 'save':await saveModel(user.userId,input);break;
   case 'delete':await deleteModel(user.userId,input.kind);break;
   case 'test':result=await testModel(user.userId,input.kind);break;
  }
  return json({...result,...await getModelConfiguration(user.userId)});
 }catch(e){
  if(e instanceof SyntaxError)return json({error:'请求格式无效，请检查输入后重试。'},400);
  return json({error:e instanceof Error?e.message:'配置操作失败，请重试。',...modelErrorDetails(e)},400);
 }
}
