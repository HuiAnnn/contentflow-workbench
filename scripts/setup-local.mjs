import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {projectRoot} from './sites-env.mjs';

// Only local emulated D1 is touched. No Cloudflare account or hosted credentials.
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))throw new Error('请使用 Node.js 22.13 或更高版本。');
const wrangler=path.join(projectRoot,'node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))throw new Error('请先运行 npm ci 安装依赖。');
function run(script,args=[],capture=false){
 const result=spawnSync(process.execPath,[script,...args],{cwd:projectRoot,stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:'utf8',env:{...process.env,CI:'true'}});
 if(result.error)throw result.error;
 if(result.status!==0){if(capture)console.error('本地数据库命令失败，请检查依赖安装和目录写入权限。');throw new Error(`本地初始化未完成（退出码 ${result.status}），原有数据未主动删除。`)}
 return result.stdout;
}
console.log('1/3 构建本地运行环境…');
run(path.join(projectRoot,'node_modules/vinext/dist/cli.js'),['build']);
const configPath=path.join(projectRoot,'dist/server/wrangler.local.json');
const config=JSON.parse(readFileSync(path.join(projectRoot,'dist/server/wrangler.json'),'utf8'));
const binding=config.d1_databases?.find(d=>d.binding==='DB');
if(!binding)throw new Error('缺少 DB 绑定，请保留 .openai/hosting.json 中的 d1 配置。');
binding.migrations_dir=path.join(projectRoot,'drizzle');
writeFileSync(configPath,JSON.stringify(config));
const localArgs=['--local','--config',configPath,'--persist-to',path.join(projectRoot,'.wrangler/state')];
function query(sql){const output=run(wrangler,['d1','execute','DB',...localArgs,'--command',sql,'--json'],true);return JSON.parse(output).flatMap(r=>r.results||[])}
const tableNames=new Set(query("SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
// Older hand-applied developer databases have no migration ledger. Never guess
// their history or replay ALTER TABLE against existing user data.
if(tableNames.has('workspaces')&&(!tableNames.has('d1_migrations')||query('SELECT COUNT(*) AS count FROM d1_migrations')[0].count===0)){
 throw new Error('检测到旧的本地数据库，但没有迁移记录。请继续使用原启动方式，先备份数据后再人工迁移；本脚本不会删除或重建数据库。');
}
console.log('2/3 配置本地 Key 加密存储…');
const keyName='MODEL_CONFIG_ENCRYPTION_KEY';
const localFiles=['.env.local','.dev.vars'];
const configs=localFiles.map(file=>{const location=path.join(projectRoot,file);const text=existsSync(location)?readFileSync(location,'utf8'):'';return {location,text,key:parseEnv(text)[keyName]?.trim()||''}});
for(const {key} of configs)if(key&&(!/^[A-Za-z0-9+/]{43}=$/.test(key)||Buffer.from(key,'base64').length!==32))throw new Error('本地加密密钥格式无效，应为 32 字节的 Base64 编码；请勿直接替换正在使用的密钥。');
const existingKeys=[...new Set(configs.map(c=>c.key).filter(Boolean))];
if(existingKeys.length>1)throw new Error('.env.local 与 .dev.vars 的加密密钥不一致，请先核对备份；没有覆盖任何已有密钥。');
if(!existingKeys.length&&tableNames.has('model_connections')&&query('SELECT COUNT(*) AS count FROM model_connections')[0].count>0)throw new Error('已有加密 API Key，但本地加密密钥丢失。请恢复 .dev.vars 备份后重试。');
const secret=existingKeys[0]||randomBytes(32).toString('base64');
for(const record of configs){if(record.key)continue;const prefix=record.text.replace(/^\s*(?:export\s+)?MODEL_CONFIG_ENCRYPTION_KEY\s*=.*$/gm,'');writeFileSync(record.location,`${prefix.trimEnd()}\n${keyName}=${secret}\n`,{mode:0o600});if(process.platform!=='win32')chmodSync(record.location,0o600)}
console.log('3/3 应用尚未执行的本地数据库迁移…');
run(wrangler,['d1','migrations','apply','DB',...localArgs]);
console.log('\n初始化完成。运行 npm run dev:local，然后打开终端显示的本机网址。\n后续启动只需 npm run dev:local；请保留 .wrangler/state、.env.local 和 .dev.vars。');
