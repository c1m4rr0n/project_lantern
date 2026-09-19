// Fair in-process barrier: normal requests/jobs can overlap; account erasure waits
// for all of them, and prevents new work until erasure has finished.
let readers=0,writer=false;
let blocked=false;
export function blockActivity(){blocked=true;}
const queue=[];
function drain(){
  if(writer)return;
  while(queue.length){
    if(queue[0].exclusive){if(readers)return;writer=true;queue.shift().grant();return;}
    readers++;queue.shift().grant();
  }
}
function enter(exclusive){return new Promise(resolve=>{queue.push({exclusive,grant:resolve});drain();});}
async function run(exclusive,fn){await enter(exclusive);try{if(blocked)throw new Error('account_maintenance_recovery_required');return await fn();}finally{if(exclusive)writer=false;else readers--;drain();}}
export const withActivity=fn=>run(false,fn);
export const withMaintenance=fn=>run(true,fn);
