import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.resolve(process.argv[2]||path.join(root,'releases/contentflow-github'));
if(destination===root||existsSync(destination))throw new Error('请选择一个不存在的新导出目录，避免覆盖源码或旧备份。');
const directories=new Set(['app','build','components','db','drizzle','examples','hooks','lib','public','scripts','tests','vendor','.github']);
const rootFiles=new Set(['README.md','SHARING_CHECKLIST.md','.env.example','.gitignore','.nvmrc','.gitattributes','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','vite.config.ts','drizzle.config.ts','eslint.config.mjs','postcss.config.mjs','cloudflare-env.d.ts','components.json']);
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
mkdirSync(destination,{recursive:true});let count=0;
for(const file of files){
 if(file==='.openai/hosting.json')continue;
 if(!(directories.has(file.split('/')[0])||rootFiles.has(file)))continue;
 if(/(^|\/)(\.env(?!\.example$)|\.dev\.vars|\.npmrc|credentials|id_rsa|id_ed25519)|\.(pem|key|p12|pfx|log|sqlite|sqlite3|db)$/.test(file))throw new Error(`导出范围含不应上传的文件：${file}`);
 const source=path.join(root,file);if(!existsSync(source)||!lstatSync(source).isFile())throw new Error(`导出文件不是普通文件：${file}`);
 mkdirSync(path.dirname(path.join(destination,file)),{recursive:true});cpSync(source,path.join(destination,file));count++;
}
const hosting=JSON.parse(readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
mkdirSync(path.join(destination,'.openai'),{recursive:true});
writeFileSync(path.join(destination,'.openai/hosting.json'),JSON.stringify({d1:hosting.d1,r2:hosting.r2},null,2)+'\n');
console.log(`已导出 ${count+1} 个源码文件到 ${destination}。未包含原站点项目 ID、Git 历史、密钥、数据库、依赖或构建产物。`);
