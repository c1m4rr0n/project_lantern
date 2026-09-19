import { resolve } from 'node:path';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { analyticsSummary } from '../src/services/analytics.js';
if(!process.env.DATA_ROOT)throw new Error('Set DATA_ROOT explicitly for administrative summaries');
const storage=createStorageManager({driver:process.env.STORAGE_DRIVER||'sqlite',dataRoot:resolve(process.env.DATA_ROOT||'data')});
try{console.log(JSON.stringify(await analyticsSummary(storage),null,2));}finally{storage.close();}
