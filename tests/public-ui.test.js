import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path){return readFile(new URL(`../public/${path}`,import.meta.url),'utf8');}

test('customer-facing UI hides internal release labels and uses paid-beta language',async()=>{
  for(const file of ['index.html','pricing.html','vendors.html','app.html']){
    const body=await read(file);
    const visibleCopy=body.replace(/\?v=rc\d+/gi,'');
    assert.equal(/RC\d/i.test(visibleCopy),false,`${file} exposes an internal RC label outside asset versioning`);
  }
  assert.match(await read('index.html'),/Start free trial/i);
});

test('verified users are routed to Vendor Watch instead of the optional pursuit profile',async()=>{
  const auth=await read('auth.js');
  assert.match(auth,/Redirecting to Vendor Watch/);
  assert.match(auth,/location\.href='\/vendors\.html'/);
});

test('optional pursuit onboarding surfaces actionable validation errors',async()=>{
  const onboarding=await read('onboarding.html');
  assert.match(onboarding,/COMPANY PROFILE/);
  assert.match(onboarding,/Pursuit Watch/);
  assert.match(onboarding,/optional for Vendor Watch/i);
  assert.match(onboarding,/monitor vendors without NAICS/i);
  assert.match(onboarding,/Add at least one NAICS code or capability/);
  assert.match(onboarding,/data\.message\|\|data\.error/);
});

test('every public HTML page declares the ExcluSignal favicon',async()=>{
  for(const file of ['index.html','pricing.html','vendors.html','app.html','auth.html','onboarding.html','digest.html']){
    assert.match(await read(file),/\/favicon\.svg/,`${file} is missing the favicon`);
  }
});
