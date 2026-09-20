import http from 'node:http';
import { releaseIdentity } from './src/runtime/release.js';
import { audit, logError } from './src/security/events.js';
import { vendorCsv, screeningReport, escapeHtml } from './src/services/vendor-export.js';
import { track } from './src/services/analytics.js';
import { deleteAccount, exportAccount, resumeDeletions } from './src/services/account-lifecycle.js';
import { withActivity, withMaintenance } from './src/security/activity.js';
import { launchConfig, launchHtml } from './src/runtime/launch.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { validateProfile } from './src/domain/profile.js';
import { validateDecision } from './src/domain/decision.js';
import { buildDigest } from './src/services/digest.js';
import { buildVendorDigest } from './src/services/vendor-digest.js';
import { createStorageManager } from './src/storage/storage-manager.js';
import { createTenantContext } from './src/services/tenant-context.js';
import { createSessionToken, expiredSessionCookie, parseCookies, sessionCookie, verifySessionToken } from './src/auth/session.js';
import { FixedWindowRateLimiter, requestClientKey } from './src/security/rate-limit.js';
import { createProviders } from './src/runtime/providers.js';
import { buildReadinessChecks } from './src/runtime/readiness.js';
import { runStartupPreflight } from './src/runtime/preflight.js';
import { fetchMockOpportunities } from './src/providers/mock.js';
import { operationalStatus } from './src/ops/status.js';
import { queueEmail } from './src/notifications/outbox-queue.js';
import { deliverOutboxFile } from './src/notifications/outbox.js';
import { productName } from './src/brand.js';
import { createEmailSender } from './src/notifications/email-sender.js';
import { startOperationalScheduler } from './src/ops/in-process-scheduler.js';
import { createBillingProvider } from './src/billing/stripe.js';
import { BillingGateError, createBillingService, tenantIdFromEvent } from './src/billing/service.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const APP_VERSION = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
const DATA = resolve(process.env.DATA_ROOT || join(ROOT, 'data'));
const OUTBOX_ROOT = join(DATA,'outbox');
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'sqlite';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/,'');
const PRODUCT_NAME = productName(process.env);
const SUPPORT_EMAIL = /^[^\s<>"'@]+@[^\s<>"'@]+\.[^\s<>"'@]+$/.test(process.env.SUPPORT_EMAIL||'') ? process.env.SUPPORT_EMAIL : null;
const LAUNCH=launchConfig();
const VERIFY_TTL_MS = Number(process.env.EMAIL_VERIFY_TTL_MS || 24*60*60*1000);
const RESET_TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MS || 60*60*1000);
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED === 'true';
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || 'console').toLowerCase();
const durationLabel = ms => ms % 86400000 === 0 ? `${ms/86400000} day${ms===86400000?'':'s'}` : ms % 3600000 === 0 ? `${ms/3600000} hour${ms===3600000?'':'s'}` : `${Math.ceil(ms/60000)} minutes`;
const { providerName, provider, detailProvider:samDetailProvider, watchProvider:samWatchProvider, marketProviderName, marketProvider, exclusionProviderName, exclusionProvider } = createProviders({ dataRoot:DATA });
const billingProvider = createBillingProvider({ env:process.env });
const seedOpportunities = await fetchMockOpportunities();
const runtimeSeedOpportunities = providerName === 'mock' ? seedOpportunities : [];
const storage = createStorageManager({ driver:STORAGE_DRIVER, dataRoot:DATA });
const accountStore = storage.accountStore;
const STARTUP_PREFLIGHT = await runStartupPreflight({
  env:process.env,
  dataRoot:DATA,
  providerName,
  marketProviderName,
  storageDriver:STORAGE_DRIVER,
  schedulerEnabled:SCHEDULER_ENABLED,
  storage
});

async function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const path = join(DATA, '.dev-session-secret');
  try { return (await readFile(path, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(DATA, { recursive: true });
    const secret = randomBytes(32).toString('base64url');
    await writeFile(path, secret, { mode: 0o600 });
    if (process.env.NODE_ENV !== 'test') console.warn('SESSION_SECRET not set; using a local persisted development secret. Set SESSION_SECRET before production deployment.');
    return secret;
  }
}
const SESSION_SECRET = await sessionSecret();
const authLimiter = new FixedWindowRateLimiter({ limit:Number(process.env.AUTH_RATE_LIMIT || 12), windowMs:Number(process.env.AUTH_RATE_WINDOW_MS || 900000) });

let emailSenderInstance=null;
function emailSender() {
  if (!emailSenderInstance) emailSenderInstance=createEmailSender({provider:EMAIL_PROVIDER,apiKey:process.env.RESEND_API_KEY || '',from:process.env.EMAIL_FROM || ''});
  return emailSenderInstance;
}

async function queueAuthEmail({ template, to, idempotencyKey, payload }) {
  const queued=await queueEmail({outboxRoot:OUTBOX_ROOT,template,to,idempotencyKey,payload});
  if (EMAIL_PROVIDER !== 'resend') return {...queued,delivery:'queued'};
  try {
    const result=await deliverOutboxFile({outboxRoot:OUTBOX_ROOT,file:queued.file,sender:emailSender()});
    return {...queued,delivery:result.status==='sent'?'sent':'queued'};
  } catch(error) {
    logError('auth_email_immediate_delivery_failed',error);
    return {...queued,delivery:'queued'};
  }
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const secureHeaders = { 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'x-frame-options':'DENY', 'permissions-policy':'camera=(), microphone=(), geolocation=()' };
function json(res, status, value, headers={}) { res.writeHead(status, { ...secureHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value)); }
async function rawBody(req, maxBytes=65536) { let s=''; let bytes=0; for await (const c of req) { bytes+=c.length; if(bytes>maxBytes) throw new Error('request_body_too_large'); s += c; } return s; }
async function body(req, maxBytes=65536) { const s=await rawBody(req,maxBytes); return s ? JSON.parse(s) : {}; }
const isSecure = req => process.env.COOKIE_SECURE === 'true' || req.headers['x-forwarded-proto'] === 'https';
const authPaths = new Set(['/api/auth/register','/api/auth/login','/api/auth/resend-verification','/api/auth/request-password-reset','/api/auth/verify-email','/api/auth/reset-password']);

async function sessionFor(req) {
  const token = parseCookies(req.headers.cookie || '').lantern_session;
  const decoded=verifySessionToken(token, SESSION_SECRET);
  if (!decoded) return null;
  const identity=await accountStore.getSessionIdentity?.(decoded.userId);
  if (!identity || !identity.emailVerifiedAt) return null;
  if (String(identity.tenantId)!==String(decoded.tenantId)) return null;
  if (Number(identity.sessionVersion || 1)!==Number(decoded.sessionVersion || 1)) return null;
  return { ...decoded, email:identity.email, tenantId:identity.tenantId, sessionVersion:identity.sessionVersion, createdAt:identity.createdAt };
}

function tokenForUser(user) {
  return createSessionToken({ userId:user.id, tenantId:user.tenantId, email:user.email, sessionVersion:user.sessionVersion }, SESSION_SECRET);
}

async function queueVerification(record) {
  if (!record) return null;
  const link=`${PUBLIC_BASE_URL}/auth.html?verify=${encodeURIComponent(record.token)}`;
  return queueAuthEmail({template:'verify-email',to:record.user.email,idempotencyKey:`verify:${record.tokenId}`,payload:{link,expiresIn:durationLabel(VERIFY_TTL_MS),productName:PRODUCT_NAME}});
}

async function queuePasswordReset(record) {
  if (!record) return null;
  const link=`${PUBLIC_BASE_URL}/auth.html?reset=${encodeURIComponent(record.token)}`;
  return queueAuthEmail({template:'password-reset',to:record.user.email,idempotencyKey:`reset:${record.tokenId}`,payload:{link,expiresIn:durationLabel(RESET_TTL_MS),productName:PRODUCT_NAME}});
}

function contextFor(session) {
  const store = storage.tenantStore(session.tenantId, { seedOpportunities:runtimeSeedOpportunities });
  return createTenantContext({ store, tenantId: session.tenantId, provider, detailProvider:samDetailProvider, watchProvider:samWatchProvider, exclusionProvider, seedOpportunities:runtimeSeedOpportunities, excludeDemoSeed:providerName !== 'mock' });
}

function billingFor(session, store) {
  return createBillingService({ store, tenantId:session.tenantId, email:session.email, accountCreatedAt:session.createdAt, publicBaseUrl:PUBLIC_BASE_URL, provider:billingProvider, env:process.env });
}

async function readiness() {
  const production = process.env.NODE_ENV === 'production';
  const checks = {
    storage:true,
    ...buildReadinessChecks({ production, env:process.env, providerName, marketProviderName, storageDriver:STORAGE_DRIVER, schedulerEnabled:SCHEDULER_ENABLED })
  };
  let accountCount = null;
  try { accountCount = typeof accountStore.count === 'function' ? await accountStore.count() : null; }
  catch { checks.storage=false; }
  return { ok:Object.values(checks).every(Boolean), storage:STORAGE_DRIVER, accountCount, checks, dataRoot: DATA === join(ROOT,'data') ? 'default' : 'custom' };
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const session = await sessionFor(req);
    if(url.pathname==='/api/public-config'&&req.method==='GET')return json(res,200,{supportEmail:SUPPORT_EMAIL});
    if(url.pathname==='/robots.txt'&&req.method==='GET') {res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});return res.end(LAUNCH.enabled?`User-agent: *\nAllow: /$\nAllow: /pricing.html\nDisallow: /api/\nDisallow: /app.html\nDisallow: /vendors.html\nDisallow: /account.html\nDisallow: /auth.html\nDisallow: /digest.html\nDisallow: /onboarding.html\nSitemap: ${LAUNCH.base}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');}
    if(url.pathname==='/sitemap.xml'&&req.method==='GET') {if(!LAUNCH.enabled)return json(res,404,{error:'not_found'});res.writeHead(200,{'content-type':'application/xml','cache-control':'no-store'});return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(LAUNCH.base)}/</loc></url><url><loc>${escapeHtml(LAUNCH.base)}/pricing.html</loc></url></urlset>`);}

    if (url.pathname === '/api/health') {
      const expiresAt = process.env.SAM_API_KEY_EXPIRES_AT || null;
      const daysRemaining = expiresAt ? Math.ceil((new Date(expiresAt + 'T23:59:59Z') - new Date()) / 86400000) : null;
      const ops=await operationalStatus({dataRoot:DATA});
      ops.release=releaseIdentity();
      return json(res, 200, { ok:true,version:APP_VERSION,provider:providerName,providerCache:provider.meta(),marketProvider:marketProviderName,enrichment:samDetailProvider?'available':'unavailable',exclusionProvider:exclusionProviderName,exclusionSnapshot:exclusionProvider?.meta?.()||null,samKeyConfigured:Boolean(process.env.SAM_API_KEY),samKeyExpiresAt:expiresAt,samKeyDaysRemaining:Number.isFinite(daysRemaining)?daysRemaining:null,samKeyNeedsRotation:Number.isFinite(daysRemaining)?daysRemaining<=14:null,auth:'signed-cookie+verified-email',multiTenant:true,storage:STORAGE_DRIVER,schedulerEnabled:SCHEDULER_ENABLED,billingProvider:billingProvider.name,billingConfigured:billingProvider.configured?.()||false,startupPreflight:STARTUP_PREFLIGHT.ok,deployment:{platform:process.env.RAILWAY_PROJECT_ID?'railway':'unknown',region:process.env.RAILWAY_REPLICA_REGION || null,deploymentId:process.env.RAILWAY_DEPLOYMENT_ID || null,volumeMounted:Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH)},operations:ops,time:new Date().toISOString() });
    }

    if (url.pathname === '/api/ready' && req.method === 'GET') { const state=await readiness(); return json(res, state.ok?200:503, state); }

    if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
      try {
        if (billingProvider.name !== 'stripe') return json(res,503,{error:'billing_unavailable'});
        const raw=await rawBody(req,1024*1024);
        const event=billingProvider.verifyWebhook(raw,req.headers['stripe-signature']);
        const tenantId=tenantIdFromEvent(event);
        if(!tenantId) return json(res,200,{ok:true,ignored:true});
        if(!(await accountStore.listUsers()).some(u=>u.tenantId===tenantId))return json(res,200,{ok:true,ignored:true});
        const store=storage.tenantStore(tenantId,{seedOpportunities:runtimeSeedOpportunities});
        const service=createBillingService({store,tenantId,publicBaseUrl:PUBLIC_BASE_URL,provider:billingProvider,env:process.env});
        const result=await service.applyStripeEvent(event);
        return json(res,200,{ok:true,duplicate:Boolean(result.duplicate),ignored:Boolean(result.ignored)});
      } catch(error) {
        return json(res,400,{error:'invalid_billing_webhook',message:process.env.NODE_ENV==='production'?'Invalid webhook':error.message});
      }
    }

    if (authPaths.has(url.pathname) && req.method === 'POST') {
      const key = `${url.pathname}:${requestClientKey(req,{trustProxy:process.env.TRUST_PROXY === 'true'})}`;
      const rate = authLimiter.check(key);
      if (!rate.allowed) return json(res, 429, { error:'rate_limited', retryAfterSeconds:rate.retryAfterSeconds }, { 'retry-after':String(rate.retryAfterSeconds) });
    }

    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      try {
        const input = await body(req, 16384);
        const user = await accountStore.register(input);
        await track(storage.tenantStore(user.tenantId),'registered',{once:true});
        const delivery=await queueVerification(await accountStore.issueEmailVerification({email:user.email,ttlMs:VERIFY_TTL_MS}));
        return json(res, 201, { user:{id:user.id,email:user.email},verificationRequired:true,delivery:delivery?.delivery || 'queued' });
      } catch (error) {
        const status = /already exists/i.test(error.message) ? 409 : 400;
        return json(res, status, { error:'registration_failed', message:error.message });
      }
    }

    if (url.pathname === '/api/auth/resend-verification' && req.method === 'POST') {
      const input=await body(req,8192);
      const record=await accountStore.issueEmailVerification({email:input.email,ttlMs:VERIFY_TTL_MS});
      const delivery=record ? await queueVerification(record) : null;
      return json(res,200,{ok:true,message:delivery?.delivery==='sent'?'If that account exists and still needs verification, a new email was sent.':'If that account exists and still needs verification, a new email has been queued.'});
    }

    if (url.pathname === '/api/auth/verify-email' && req.method === 'POST') {
      const input=await body(req,8192);
      const user=await accountStore.verifyEmailToken(input.token,{now:new Date()});
      if (!user) return json(res,400,{error:'invalid_or_expired_token'});
      await audit(storage.tenantStore(user.tenantId),'email.verified');
      await track(storage.tenantStore(user.tenantId),'verified',{once:true});
      const token=tokenForUser(user);
      return json(res,200,{ok:true,user:{id:user.id,email:user.email},tenantId:user.tenantId},{'set-cookie':sessionCookie(token,{secure:isSecure(req)})});
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const input = await body(req, 16384);
      const user = await accountStore.authenticate(input);
      if (!user) return json(res, 401, { error:'invalid_credentials' });
      if (!user.emailVerifiedAt) return json(res,403,{error:'email_verification_required'});
      await audit(storage.tenantStore(user.tenantId),'login.success');
      await track(storage.tenantStore(user.tenantId),'first_login',{once:true});
      const token = tokenForUser(user);
      return json(res, 200, { user:{id:user.id,email:user.email},tenantId:user.tenantId }, { 'set-cookie':sessionCookie(token,{secure:isSecure(req)}) });
    }

    if (url.pathname === '/api/auth/request-password-reset' && req.method === 'POST') {
      const input=await body(req,8192);
      const record=await accountStore.issuePasswordReset({email:input.email,ttlMs:RESET_TTL_MS});
      const delivery=record ? await queuePasswordReset(record) : null;
      return json(res,200,{ok:true,message:delivery?.delivery==='sent'?'If that account exists, a password-reset email was sent.':'If that account exists, a password-reset email has been queued.'});
    }

    if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
      try {
        const input=await body(req,16384);
        const user=await accountStore.resetPasswordWithToken(input.token,input.password,{now:new Date()});
        if (!user) return json(res,400,{error:'invalid_or_expired_token'});
        await audit(storage.tenantStore(user.tenantId),'password.reset');
        await track(storage.tenantStore(user.tenantId),'verified',{once:true});
        const token=tokenForUser(user);
        return json(res,200,{ok:true,user:{id:user.id,email:user.email},tenantId:user.tenantId},{'set-cookie':sessionCookie(token,{secure:isSecure(req)})});
      } catch (error) {
        if (/password must/i.test(error.message)) return json(res,400,{error:'invalid_password',message:error.message});
        throw error;
      }
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      if(session) await audit(storage.tenantStore(session.tenantId),'logout');
      return json(res, 200, { ok:true }, { 'set-cookie': expiredSessionCookie({ secure:isSecure(req) }) });
    }
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      if(session)await track(storage.tenantStore(session.tenantId),'return_activity');
      return session ? json(res,200,{user:{id:session.userId,email:session.email,emailVerified:true},tenantId:session.tenantId}) : json(res,401,{error:'unauthorized'});
    }

    if (url.pathname.startsWith('/api/') && !session) return json(res, 401, { error:'unauthorized' });
    const tenant = session ? contextFor(session) : null;
    const billing = session ? billingFor(session,tenant.store) : null;
    const requireActive = async()=>billing.assertActiveAccess();
    if(['/api/account/export','/api/account/delete'].includes(url.pathname)&&req.method==='POST') {
      if(req.headers.origin!==new URL(PUBLIC_BASE_URL).origin)return json(res,403,{error:'same_origin_required'});
      const rate=authLimiter.check(`account-action:${session.userId}`);
      if(!rate.allowed)return json(res,429,{error:'rate_limited'});
      const input=await body(req,16384),user=await accountStore.authenticate({email:session.email,password:input.password});
      if(!user||user.id!==session.userId)return json(res,401,{error:'password_confirmation_failed'});
      if(url.pathname.endsWith('/export'))return json(res,200,await exportAccount({user,store:tenant.store}),{'content-disposition':'attachment; filename="exclusignal-account.json"'});
      try {const result=await deleteAccount({storage,dataRoot:DATA,user,store:tenant.store,billing:await billing.state(),provider:billingProvider,confirmation:input.confirmation});return json(res,200,result,{'set-cookie':expiredSessionCookie({secure:isSecure(req)})});}
      catch(error){logError('account_deletion_failed',error);return json(res,error.status||503,{error:'account_deletion_blocked',message:error.status?error.message:'Deletion could not complete. Access may already be revoked; contact support for safe recovery.'});}
    }

    if (url.pathname === '/api/billing/status' && req.method === 'GET') return json(res,200,await billing.status());
    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      try { const input=await body(req,8192); return json(res,200,await billing.checkout(String(input.plan||''))); }
      catch(error){ if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); throw error; }
    }
    if (url.pathname === '/api/billing/portal' && req.method === 'POST') {
      try { return json(res,200,await billing.portal()); }
      catch(error){ if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); throw error; }
    }

    if (url.pathname === '/api/profile' && req.method === 'GET') return json(res, 200, await tenant.store.getProfile());
    if (url.pathname === '/api/profile' && req.method === 'POST') {
      try { await requireActive(); return json(res, 200, await tenant.store.saveProfile(validateProfile(await body(req)))); }
      catch (error) { if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); return json(res, 400, { error:'invalid_profile', message:error.message }); }
    }
    if (url.pathname === '/api/opportunities' && req.method === 'GET') return json(res, 200, await tenant.service.list());
    if (url.pathname === '/api/discovery' && req.method === 'GET') return json(res,200,await tenant.service.discoveryStatus());
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      try { await requireActive(); return json(res, 200, await tenant.service.sync()); }
      catch(error){
        if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});
        if(String(error.code||'').startsWith('discovery_'))return json(res,error.status||503,{error:error.code,...(error.retryAt?{retryAt:error.retryAt}:{})});
        throw error;
      }
    }
    if (url.pathname === '/api/digest' && req.method === 'GET') {
      const [profile, items, vendors] = await Promise.all([tenant.store.getProfile(), tenant.service.list(), tenant.vendorService.list()]);
      return json(res, 200, buildDigest(profile, items, new Date(), buildVendorDigest(vendors)));
    }
    if(url.pathname==='/api/vendors/import/preview'&&req.method==='POST') {
      try {await requireActive();return json(res,200,await tenant.vendorService.previewCsv((await body(req,2*1024*1024)).text));}
      catch(error){return json(res,error.status||400,{error:'import_failed',message:error.message});}
    }
    if(url.pathname==='/api/vendors/import/commit'&&req.method==='POST') {
      try {const input=await body(req,2*1024*1024);return json(res,201,await tenant.vendorService.importCsv(input,{capacity:n=>billing.assertVendorCapacity(n)}));}
      catch(error){return json(res,error.status||400,{error:'import_failed',message:error.message});}
    }
    if(url.pathname==='/api/vendors/export.csv'&&req.method==='GET') {
      const csv=vendorCsv(await tenant.vendorService.list({all:true}));
      await track(tenant.store,'report_exported');
      res.writeHead(200,{...secureHeaders,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="exclusignal-vendors.csv"','cache-control':'no-store'});return res.end(csv);
    }
    const reportMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)\/report$/);
    if(reportMatch&&req.method==='GET') {
      const id=decodeURIComponent(reportMatch[1]),vendor=await tenant.vendorService.get(id);
      if(!vendor)return json(res,404,{error:'not_found'});
      const html=screeningReport(vendor,await tenant.vendorService.history(id));await audit(tenant.store,'report.exported',{subjectId:id});
      await track(tenant.store,'report_exported');
      res.writeHead(200,{...secureHeaders,'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});return res.end(html);
    }
    const restoreMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)\/restore$/);
    if(restoreMatch&&req.method==='POST') {
      try {await requireActive();const restored=await tenant.vendorService.restore(decodeURIComponent(restoreMatch[1]),{capacity:n=>billing.assertVendorCapacity(n)});return json(res,restored?200:404,restored||{error:'not_found'});}
      catch(error){return json(res,error.status||400,{error:'restore_failed',message:error.message});}
    }
    if (url.pathname === '/api/vendors' && req.method === 'GET') return json(res,200,await tenant.vendorService.list({archived:url.searchParams.get('archived')==='true'}));
    if (url.pathname === '/api/vendors' && req.method === 'POST') {
      try {
        return json(res,201,await tenant.vendorService.add(await body(req,16384),{capacity:n=>billing.assertVendorCapacity(n)}));
      } catch(error){
        if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});
        return json(res,400,{error:'invalid_vendor',message:error.message});
      }
    }
    if (url.pathname === '/api/vendors/screen' && req.method === 'POST') {
      try {
        await billing.assertScreeningAllowed();
        return json(res,200,await tenant.vendorService.screenAll({force:Boolean((await body(req,4096)).force)}));
      } catch(error){
        if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});
        if(/not configured/i.test(error.message))return json(res,503,{error:'screening_unavailable'}); throw error;
      }
    }
    const vendorMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)$/);
    if(vendorMatch&&req.method==='GET'){
      const item=await tenant.vendorService.get(decodeURIComponent(vendorMatch[1]));
      return item?json(res,200,item):json(res,404,{error:'not_found'});
    }
    if(vendorMatch&&req.method==='PUT'){
      try{await requireActive();const item=await tenant.vendorService.update(decodeURIComponent(vendorMatch[1]),await body(req,16384));return item?json(res,200,item):json(res,404,{error:'not_found'});}
      catch(error){if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});return json(res,400,{error:'invalid_vendor',message:error.message});}
    }
    if(vendorMatch&&req.method==='DELETE'){try{await requireActive();const removed=await tenant.vendorService.remove(decodeURIComponent(vendorMatch[1]));return removed?json(res,200,{ok:true}):json(res,404,{error:'not_found'});}catch(error){if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});throw error;}}
    const vendorScreenMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)\/screen$/);
    if(vendorScreenMatch&&req.method==='POST'){
      try{
        await billing.assertScreeningAllowed();
        const item=await tenant.vendorService.screenOne(decodeURIComponent(vendorScreenMatch[1]),{force:Boolean((await body(req,4096)).force)});return item?json(res,200,item):json(res,404,{error:'not_found'});
      } catch(error){
        if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});
        if(error.code==='vendor_archived')return json(res,409,{error:error.code,message:error.message});
        if(/not configured/i.test(error.message))return json(res,503,{error:'screening_unavailable'});throw error;
      }
    }
    const vendorHistoryMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)\/screenings$/);
    if(vendorHistoryMatch&&req.method==='GET')return json(res,200,{vendorId:decodeURIComponent(vendorHistoryMatch[1]),screenings:await tenant.vendorService.history(decodeURIComponent(vendorHistoryMatch[1]))});
    const vendorAckMatch=url.pathname.match(/^\/api\/vendors\/([^/]+)\/screenings\/ack$/);
    if(vendorAckMatch&&req.method==='POST'){try{await requireActive();return json(res,200,await tenant.vendorService.acknowledge(decodeURIComponent(vendorAckMatch[1])));}catch(error){if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});throw error;}}
    if (url.pathname === '/api/market-context' && req.method === 'GET') {
      try {
        await requireActive();
        const naics = url.searchParams.get('naics');
        if (!naics) return json(res, 400, { error: 'naics_required' });
        return json(res, 200, await marketProvider({ naics }));
      } catch(error){ if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); throw error; }
    }
    const enrichMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/enrich$/);
    if (enrichMatch && req.method === 'POST') {
      const id = decodeURIComponent(enrichMatch[1]);
      try {
        await requireActive();
        const item = await tenant.service.enrich(id);
        return item ? json(res, 200, item) : json(res, 404, { error:'not_found' });
      } catch (error) {
        if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message});
        if (/not configured/i.test(error.message)) return json(res, 503, { error:'enrichment_unavailable' });
        throw error;
      }
    }
    const changesMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/changes$/);
    if (changesMatch && req.method === 'GET') {
      const id=decodeURIComponent(changesMatch[1]);
      return json(res,200,{opportunityId:id,changes:await tenant.service.changes(id)});
    }
    const acknowledgeChangesMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/changes\/ack$/);
    if (acknowledgeChangesMatch && req.method === 'POST') {
      try {
        await requireActive();
        const id=decodeURIComponent(acknowledgeChangesMatch[1]);
        const item=await tenant.service.get(id);
        if(!item) return json(res,404,{error:'not_found'});
        return json(res,200,await tenant.service.acknowledgeChanges(id));
      } catch(error){ if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); throw error; }
    }

    const decisionMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/decision$/);
    if (decisionMatch && req.method === 'POST') {
      const id = decodeURIComponent(decisionMatch[1]);
      const item = await tenant.service.get(id);
      if (!item) return json(res, 404, { error:'not_found' });
      try { await requireActive(); return json(res, 200, await tenant.store.saveDecision(id, validateDecision(await body(req, 8192)))); }
      catch (error) { if(error instanceof BillingGateError)return json(res,error.status,{error:error.code,message:error.message}); return json(res, 400, { error:'invalid_decision', message:error.message }); }
    }
    if (url.pathname.startsWith('/api/opportunities/') && req.method === 'GET') {
      const item = await tenant.service.get(decodeURIComponent(url.pathname.split('/').pop()));
      return item ? json(res, 200, item) : json(res, 404, { error: 'not_found' });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

    const requested = url.pathname === '/' ? '/index.html' : (url.pathname === '/favicon.ico' ? '/favicon.svg' : url.pathname);
    if (session && (req.method === 'GET' || req.method === 'HEAD') &&
        (requested === '/index.html' || (requested === '/auth.html' && !url.searchParams.has('verify') && !url.searchParams.has('reset')))) {
      res.writeHead(302, { location:'/vendors.html', ...secureHeaders, 'cache-control':'no-store' }); return res.end();
    }
    if (['/app.html','/onboarding.html','/digest.html','/vendors.html','/account.html'].includes(requested) && !session) {
      res.writeHead(302, { location:'/auth.html', ...secureHeaders, 'cache-control':'no-store' }); return res.end();
    }
    const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
    const path = join(ROOT, 'public', safe);
    if (!path.startsWith(join(ROOT, 'public'))) return json(res, 403, { error: 'forbidden' });
    let data = await readFile(path);
    if(extname(path)==='.html')data=Buffer.from(launchHtml(data.toString(),requested,LAUNCH));
    if(extname(path)==='.html'&&SUPPORT_EMAIL) data=Buffer.from(data.toString().replace('</body>',`<footer class="supportFooter"><a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">Contact support: ${escapeHtml(SUPPORT_EMAIL)}</a><p>For recovery help, contact support. Never send passwords or verification links.</p></footer></body>`));
    res.writeHead(200, { ...secureHeaders, 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control':'no-store, max-age=0', 'pragma':'no-cache', 'expires':'0', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(data);
  } catch (error) {
    if (error?.code === 'ENOENT') return json(res, 404, { error: 'not_found' });
    if (error?.message === 'request_body_too_large') return json(res, 413, { error:'request_body_too_large' });
    if (error instanceof SyntaxError) return json(res, 400, { error:'invalid_json' });
    logError('request_failed',error);
    json(res, 500, { error:'internal_error', message:process.env.NODE_ENV === 'production' ? 'Unexpected server error' : error.message });
  }
}

function handler(req,res) {
  const deleting=new URL(req.url,'http://localhost').pathname==='/api/account/delete'&&req.method==='POST';
  return (deleting?withMaintenance:withActivity)(()=>handleRequest(req,res)).catch(error=>{logError('maintenance_recovery_required',error);json(res,503,{error:'maintenance_recovery_required'});});
}

if (process.env.NODE_ENV !== 'test') {
  await resumeDeletions({storage,dataRoot:DATA});
  await exclusionProvider?.restoreMetadata?.();
  const server=http.createServer(handler);
  const scheduler=SCHEDULER_ENABLED ? startOperationalScheduler({
    accountStore,
    tenantStoreFor:(tenantId,options)=>storage.tenantStore(tenantId,options),
    provider,
    watchProvider:samWatchProvider,
    detailProvider:samDetailProvider,
    exclusionProvider,
    billingStatusFor:(user,store)=>createBillingService({store,tenantId:user.tenantId,email:user.email,accountCreatedAt:user.createdAt,publicBaseUrl:PUBLIC_BASE_URL,provider:billingProvider,env:process.env}).status(),
    providerName,
    seedOpportunities:runtimeSeedOpportunities,
    outboxRoot:OUTBOX_ROOT,
    dataRoot:DATA,
    emailSender:emailSender(),
    storageDriver:STORAGE_DRIVER,
    intervalMs:Number(process.env.SCHEDULER_INTERVAL_MS || 60000),
    dailyHourUtc:Number(process.env.DAILY_JOB_HOUR_UTC || 12),
    backupHourUtc:Number(process.env.BACKUP_HOUR_UTC || 13),
    emailEveryMs:Number(process.env.EMAIL_DELIVERY_INTERVAL_MS || 300000),
    emailBatchLimit:Number(process.env.EMAIL_BATCH_LIMIT || 100),
    retryMs:Number(process.env.SCHEDULER_RETRY_MS || 600000),
    retentionCount:Number(process.env.BACKUP_RETENTION_COUNT || 7)
  }) : null;
  server.listen(PORT, () => console.log(`${PRODUCT_NAME} running on http://localhost:${PORT} using ${providerName} provider + ${STORAGE_DRIVER} storage${SCHEDULER_ENABLED?' + scheduler':''}`));
  let shuttingDown=false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown=true;
    console.log(JSON.stringify({event:'shutdown_started',signal}));
    scheduler?.stop();
    const deadline=setTimeout(()=>{
      console.error(JSON.stringify({event:'shutdown_forced',signal}));
      try { storage.close?.(); } catch {}
      process.exit(1);
    },10000);
    deadline.unref?.();
    server.close(()=>{
      clearTimeout(deadline);
      try { storage.close?.(); } catch {}
      console.log(JSON.stringify({event:'shutdown_complete',signal}));
      process.exit(0);
    });
  };
  process.once('SIGTERM',()=>shutdown('SIGTERM'));
  process.once('SIGINT',()=>shutdown('SIGINT'));
}
export { handler, readiness };
