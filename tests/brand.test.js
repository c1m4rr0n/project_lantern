import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_PRODUCT_NAME, productName } from '../src/brand.js';

const publicFiles=['index.html','vendors.html','app.html','auth.html','onboarding.html','digest.html'];

test('commercial brand defaults to ExcluSignal and supports runtime override',()=>{
  assert.equal(DEFAULT_PRODUCT_NAME,'ExcluSignal');
  assert.equal(productName({}),'ExcluSignal');
  assert.equal(productName({PRODUCT_NAME:'Acme Monitor'}),'Acme Monitor');
});

test('public UI does not expose the Project Lantern codename',async()=>{
  for(const file of publicFiles){
    const body=await readFile(new URL(`../public/${file}`,import.meta.url),'utf8');
    assert.equal(body.includes('Project Lantern'),false,`${file} exposes internal codename`);
    assert.match(body,/ExcluSignal/i,`${file} should show commercial brand`);
  }
});
