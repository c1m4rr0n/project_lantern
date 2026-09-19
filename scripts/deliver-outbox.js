import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmailSender } from '../src/notifications/email-sender.js';
import { deliverOutbox } from '../src/notifications/outbox.js';

const ROOT=fileURLToPath(new URL('..', import.meta.url));
const dataRoot=resolve(process.env.DATA_ROOT || join(ROOT,'data'));
const provider=process.env.EMAIL_PROVIDER || 'console';
const sender=createEmailSender({provider,apiKey:process.env.RESEND_API_KEY || '',from:process.env.EMAIL_FROM || ''});
const result=await deliverOutbox({outboxRoot:join(dataRoot,'outbox'),sender,limit:Number(process.env.EMAIL_BATCH_LIMIT || 100)});
console.log(JSON.stringify({ok:result.ok,provider,processed:result.processed,sent:result.sent,failed:result.failed}));
if (!result.ok) process.exitCode=1;
