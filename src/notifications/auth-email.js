function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function safeLink(value) {
  const link=String(value || '');
  if (!/^https?:\/\//i.test(link)) throw new Error('auth email link must be http(s)');
  return link;
}

export function renderVerificationEmail(payload = {}) {
  const link=safeLink(payload.link);
  const company=payload.productName || 'ExcluSignal';
  return {
    subject:`Verify your ${company} email`,
    html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#101828;line-height:1.5"><div style="max-width:640px;margin:auto;padding:24px"><p style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#667085">${esc(company.toUpperCase())} · ACCOUNT SECURITY</p><h1 style="font-size:28px">Verify your email</h1><p>Confirm this address before using the workspace.</p><p><a href="${esc(link)}" style="display:inline-block;background:#172554;color:white;text-decoration:none;padding:12px 18px;border-radius:8px">Verify email</a></p><p style="font-size:12px;color:#667085">This link expires in ${esc(payload.expiresIn || '24 hours')}. If you did not create this account, you can ignore this message.</p></div></body></html>`,
    text:`${company} — verify your email\n\nOpen this link to verify your address:\n${link}\n\nThis link expires in ${payload.expiresIn || '24 hours'}. If you did not create this account, ignore this message.`
  };
}

export function renderPasswordResetEmail(payload = {}) {
  const link=safeLink(payload.link);
  const company=payload.productName || 'ExcluSignal';
  return {
    subject:`Reset your ${company} password`,
    html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#101828;line-height:1.5"><div style="max-width:640px;margin:auto;padding:24px"><p style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#667085">${esc(company.toUpperCase())} · ACCOUNT SECURITY</p><h1 style="font-size:28px">Reset your password</h1><p>A password reset was requested for your account.</p><p><a href="${esc(link)}" style="display:inline-block;background:#172554;color:white;text-decoration:none;padding:12px 18px;border-radius:8px">Reset password</a></p><p style="font-size:12px;color:#667085">This link expires in ${esc(payload.expiresIn || '1 hour')} and can be used once. If you did not request it, ignore this message; your password has not changed.</p></div></body></html>`,
    text:`${company} — reset your password\n\nOpen this one-time link:\n${link}\n\nThis link expires in ${payload.expiresIn || '1 hour'}. If you did not request it, ignore this message.`
  };
}
