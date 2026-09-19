import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const patterns=[
  {name:'SAM-style API key',re:/SAM-[0-9a-f]{8}-[0-9a-f-]{20,}/i},
  {name:'obvious private key block',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:'Resend-style API key',re:/\bre_[A-Za-z0-9_-]{20,}\b/},
  {name:'Stripe live secret',re:/\bsk_live_[A-Za-z0-9]{16,}\b/}
];
let findings=[];
for(const file of files){
  let text;try{text=await readFile(file,'utf8');}catch{continue;}
  for(const p of patterns) if(p.re.test(text)) findings.push({file,type:p.name});
}
if(findings.length){console.error(JSON.stringify({ok:false,findings},null,2));process.exitCode=1;}
else console.log(JSON.stringify({ok:true,repositoryFilesScanned:files.length,findings:0},null,2));
