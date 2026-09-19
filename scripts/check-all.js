import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function files(dir){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())found.push(...await files(path));else if(path.endsWith('.js'))found.push(path);}return found;}
for(const path of ['server.js',...(await Promise.all(['src','public','scripts','tests'].map(files))).flat()]){
  const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
