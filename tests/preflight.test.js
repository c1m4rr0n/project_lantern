import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageManager } from '../src/storage/sqlite-storage.js';
import { runStartupPreflight } from '../src/runtime/preflight.js';

function prodEnv(root, overrides={}) {
  return {
    NODE_ENV:'production',
    SESSION_SECRET:'x'.repeat(32),
    COOKIE_SECURE:'true',
    PUBLIC_BASE_URL:'https://lantern.example.com',
    DATA_ROOT:root,
    SAM_API_KEY:'configured',
    EMAIL_PROVIDER:'resend',
    RESEND_API_KEY:'configured',
    EMAIL_FROM:'ExcluSignal <alerts@example.com>',
    BILLING_PROVIDER:'stripe',
    STRIPE_SECRET_KEY:'sk_test_x',
    STRIPE_WEBHOOK_SECRET:'whsec_x',
    STRIPE_PRICE_STARTER:'price_start',
    STRIPE_PRICE_TEAM:'price_team',
    ...overrides
  };
}

test('production preflight verifies writable storage and sqlite integrity', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-preflight-'));
  const storage=new SqliteStorageManager({path:join(root,'lantern.sqlite')});
  try {
    const result=await runStartupPreflight({env:prodEnv(root),production:true,dataRoot:root,providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true,storage});
    assert.equal(result.ok,true);
    assert.equal(result.checks.dataRootWritable,true);
    assert.equal(result.checks.storageIntegrity,true);
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});

test('Railway production preflight requires the attached volume to match DATA_ROOT', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-railway-preflight-'));
  const storage=new SqliteStorageManager({path:join(root,'lantern.sqlite')});
  try {
    await assert.rejects(()=>runStartupPreflight({
      env:prodEnv(root,{RAILWAY_PROJECT_ID:'project',RAILWAY_VOLUME_MOUNT_PATH:'/wrong'}),
      production:true,dataRoot:root,providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true,storage
    }),error=>error.code==='PRODUCTION_PREFLIGHT_FAILED' && error.preflight.failed.includes('railwayVolumeMatchesDataRoot'));
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});

test('production preflight refuses unsafe configuration before serving traffic', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-bad-preflight-'));
  const storage=new SqliteStorageManager({path:join(root,'lantern.sqlite')});
  try {
    await assert.rejects(()=>runStartupPreflight({
      env:prodEnv(root,{COOKIE_SECURE:'false',EMAIL_PROVIDER:'console'}),
      production:true,dataRoot:root,providerName:'mock',marketProviderName:'mock',storageDriver:'sqlite',schedulerEnabled:false,storage
    }),error=>error.code==='PRODUCTION_PREFLIGHT_FAILED' && error.preflight.failed.includes('secureCookie') && error.preflight.failed.includes('liveEmail'));
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});
