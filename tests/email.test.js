import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDigestEmail } from '../src/notifications/digest-email.js';
import { createEmailSender } from '../src/notifications/email-sender.js';

test('digest email escapes user-controlled text and renders useful summary',()=>{
  const out=renderDigestEmail({company:'A&B <script>',scanned:2,strongCount:1,reviewCount:0,pursueCount:1,topMatches:[{title:'Cloud <Ops>',score:92,deadline:'2026-10-01',reasons:['NAICS match']}],upcomingDeadlines:[]});
  assert.match(out.subject,/1 strong match/);
  assert.equal(out.html.includes('<script>'),false);
  assert.match(out.html,/A&amp;B &lt;script&gt;/);
  assert.match(out.text,/Cloud <Ops>/);
});

test('resend adapter uses fixed official endpoint, bearer auth, and idempotency key',async()=>{
  let request;
  const fetchImpl=async(url,options)=>{request={url,options};return new Response(JSON.stringify({id:'email-1'}),{status:200});};
  const sender=createEmailSender({provider:'resend',apiKey:'re_test_secret',from:'Lantern <alerts@example.com>',fetchImpl});
  const receipt=await sender({to:'buyer@example.com',subject:'Daily',html:'<p>Hi</p>',text:'Hi',idempotencyKey:'daily:2026-09-18:t1'});
  assert.equal(request.url,'https://api.resend.com/emails');
  assert.equal(request.options.headers.authorization,'Bearer re_test_secret');
  assert.equal(request.options.headers['idempotency-key'],'daily:2026-09-18:t1');
  assert.equal(receipt.id,'email-1');
});

import { renderPasswordResetEmail, renderVerificationEmail } from '../src/notifications/auth-email.js';

test('auth emails escape content and require http(s) links',()=>{
  const verify=renderVerificationEmail({link:'https://lantern.example/auth.html?verify=a&b=<x>',productName:'Lantern'});
  assert.match(verify.subject,/Verify/);
  assert.equal(verify.html.includes('<x>'),false);
  assert.match(verify.text,/https:\/\/lantern\.example/);
  const reset=renderPasswordResetEmail({link:'https://lantern.example/auth.html?reset=abc'});
  assert.match(reset.subject,/Reset/);
  assert.throws(()=>renderVerificationEmail({link:'javascript:alert(1)'}),/http/);
});

test('digest email surfaces vendor exclusion alerts without making a legal eligibility claim',()=>{
  const out=renderDigestEmail({company:'ACME',scanned:0,strongCount:0,reviewCount:0,pursueCount:0,changedPursuits:[],topMatches:[],upcomingDeadlines:[],vendorWatch:{total:2,excludedCount:1,possibleMatchCount:0,alertCount:1,alerts:[{legalName:'Risk Vendor LLC',status:'excluded',reason:'Exact UEI match found in the active SAM.gov exclusions extract.'}]}});
  assert.match(out.subject,/vendor risk signal/i);
  assert.match(out.html,/Vendor Exclusion Watch/);
  assert.match(out.text,/screening and monitoring tool, not a legal determination/i);
  assert.match(out.text,/Risk Vendor LLC/);
});
