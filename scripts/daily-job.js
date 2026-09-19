import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { createProviders } from '../src/runtime/providers.js';
import { fetchMockOpportunities } from '../src/providers/mock.js';
import { runDaily } from '../src/ops/daily-run.js';

const ROOT=fileURLToPath(new URL('..', import.meta.url));
const dataRoot=resolve(process.env.DATA_ROOT || join(ROOT,'data'));
const storageDriver=process.env.STORAGE_DRIVER || 'sqlite';
const storage=createStorageManager({driver:storageDriver,dataRoot});
try {
  const {provider,watchProvider,detailProvider,providerName}=createProviders({dataRoot});
  const seedOpportunities=await fetchMockOpportunities();
  const result=await runDaily({
    accountStore:storage.accountStore,
    tenantStoreFor:(tenantId,options)=>storage.tenantStore(tenantId,options),
    provider,
    watchProvider,
    detailProvider,
    seedOpportunities,
    outboxRoot:join(dataRoot,'outbox'),
    productName:process.env.PRODUCT_NAME || 'ExcluSignal'
  });
  await mkdir(join(dataRoot,'ops'),{recursive:true});
  const status={...result,provider:providerName,storage:storageDriver};
  const path=join(dataRoot,'ops','last-daily-run.json');
  const tmp=`${path}.${process.pid}.tmp`;
  await writeFile(tmp,JSON.stringify(status,null,2),{mode:0o600});
  await rename(tmp,path);
  console.log(JSON.stringify({ok:true,provider:providerName,storage:storageDriver,tenants:result.tenants,queued:result.queued,skipped:result.skipped,opportunitiesFetched:result.opportunitiesFetched}));
} finally { storage.close?.(); }
