import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowRateLimiter, requestClientKey } from '../src/security/rate-limit.js';

test('fixed-window limiter blocks after threshold and resets after window',()=>{
  let now=1000;
  const limiter=new FixedWindowRateLimiter({limit:2,windowMs:1000,now:()=>now});
  assert.equal(limiter.check('ip').allowed,true);
  assert.equal(limiter.check('ip').allowed,true);
  const blocked=limiter.check('ip');
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.remaining,0);
  now=2001;
  assert.equal(limiter.check('ip').allowed,true);
});

test('client key ignores spoofable forwarded headers unless proxy trust is explicit',()=>{
  const req={headers:{'x-forwarded-for':'203.0.113.1'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(requestClientKey(req),'127.0.0.1');
  assert.equal(requestClientKey(req,{trustProxy:true}),'203.0.113.1');
});
