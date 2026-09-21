// Operator-only aggregate accounting; no network and no credential/profile output.
import {join,resolve} from 'node:path';
import {SamRequestBudget} from '../src/ops/sam-request-budget.js';
const ledger=new SamRequestBudget({path:join(resolve(process.env.DATA_ROOT||'data'),'ops/sam-request-budget.json'),limit:process.env.SAM_DAILY_REQUEST_BUDGET});
try{console.log(JSON.stringify(await ledger.status(),null,2));}
catch{console.error('SAM usage ledger unavailable. Inspect local operational storage; no allowance can be inferred.');process.exitCode=1;}
