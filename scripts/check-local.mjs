import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {projectRoot} from './sites-env.mjs';
const base='http://127.0.0.1:5193';
let server,serverError;
async function start(){
 serverError=undefined;
 server=spawn(process.execPath,[path.join(projectRoot,'node_modules/vinext/dist/cli.js'),'dev','--hostname','127.0.0.1','--port','5193'],{cwd:projectRoot,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true'}});
 server.on('error',e=>{serverError=e});server.stdout.resume();server.stderr.resume();
 for(let i=0;i<90;i++){
  if(serverError)throw serverError;
  if(server.exitCode!==null)throw new Error(`Local server exited (${server.exitCode})`);
  try{const response=await fetch(base+'/api/workspace',{signal:AbortSignal.timeout(1000)});if(response.status===401)return}catch{}
  await delay(500);
 }
 throw new Error('Local server did not become ready. Run npm run dev:local to see startup details.');
}
async function stop(){
 if(!server||server.exitCode!==null)return;
 const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');
 await Promise.race([exited,delay(5000)]);
 if(server.exitCode===null)server.kill('SIGKILL');
}
function run(script){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:projectRoot,stdio:'inherit',env:{...process.env,CONTENTFLOW_TEST_URL:base}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Local check failed (${code})`)))})}
async function snapshot(){
 const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});assert.equal(login.status,302);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await fetch(base+'/api/workspace',{headers:{cookie}});assert.equal(response.status,200);return response.json();
}
try{
 await start();await run(path.join(projectRoot,'tests/local-smoke.test.mjs'));
 const before=await snapshot();await stop();await start();
 assert.deepEqual(await snapshot(),before,'Restarting must preserve all workspace records and publication snapshots');
 console.log('通过：服务停止并重新启动后，商品、版本和发布快照完整保留。');
}finally{await stop()}
