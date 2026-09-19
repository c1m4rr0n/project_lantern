import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../src/domain/requirements.js';

test('extracts auditable requirement candidates without inventing text',()=>{
  const text=`Background information only.\nOfferors must submit a technical proposal by 2:00 PM.\nThe contractor shall maintain an active SAM registration.\nWe expect innovation.`;
  const items=extractRequirements(text);
  assert.equal(items.length,2);
  assert.equal(items[0].mandatory,true);
  assert.match(items[0].text,/must submit/);
  assert.equal(items[0].status,'unverified');
});
