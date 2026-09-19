import { join, resolve, sep } from 'node:path';
import { rm } from 'node:fs/promises';
import { AccountStore } from './account-store.js';
import { TenantJsonStore } from './tenant-json-store.js';
import { SqliteStorageManager } from './sqlite-storage.js';

class JsonStorageManager {
  constructor({ dataRoot }) {
    this.dataRoot = dataRoot;
    this.accountStore = new AccountStore({ path: join(dataRoot, 'accounts.json') });
  }
  tenantStore(tenantId, options = {}) {
    return new TenantJsonStore({ root:join(this.dataRoot, 'tenants'), tenantId, ...options });
  }
  async integrityCheck() { return 'ok'; }
  async eraseTenant(tenantId) {
    const store=this.tenantStore(tenantId),root=resolve(this.dataRoot,'tenants');
    if(!store.dir.startsWith(root+sep))throw new Error('unsafe tenant path');
    await rm(store.dir,{recursive:true,force:true});
  }
  close() {}
}

export function createStorageManager({ driver = 'sqlite', dataRoot }) {
  if (driver === 'sqlite') return new SqliteStorageManager({ path:join(dataRoot, 'lantern.sqlite') });
  if (driver === 'json') return new JsonStorageManager({ dataRoot });
  throw new Error(`unsupported storage driver: ${driver}`);
}
