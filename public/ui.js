export function setAccountIdentity(payload) {
  const main = document.querySelector('main');
  if (main && !document.querySelector('.skipLink')) {
    main.id ||= 'mainContent';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skipLink';
    skip.href = `#${main.id}`;
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }
  const user = payload?.user || payload || {};
  const email = String(user.email || '').trim();
  const emailEl = document.querySelector('#accountEmail');
  const avatarEl = document.querySelector('#accountAvatar');
  const account = document.querySelector('#accountCluster');
  const guest = document.querySelector('#guestAuth');
  if (emailEl) {
    emailEl.textContent = email || 'Account';
    emailEl.title = email;
  }
  if (avatarEl) avatarEl.textContent = (email[0] || 'A').toUpperCase();
  if (account) account.hidden = !email;
  if (guest) guest.hidden = Boolean(email);
  if(account&&email&&!account.querySelector('[data-account-settings]')){
    const link=document.createElement('a');link.href='/account.html';link.textContent='Account';link.dataset.accountSettings='1';account.append(link);
  }
}

export async function getAccount({ required = true } = {}) {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) {
    if (required) location.href = '/auth.html';
    return null;
  }
  if (!response.ok) throw new Error(`Could not load account (${response.status})`);
  const payload = await response.json();
  setAccountIdentity(payload);
  return payload;
}

export function bindLogout() {
  const button = document.querySelector('#logout');
  if (!button || button.dataset.boundLogout === '1') return;
  button.dataset.boundLogout = '1';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await fetch('/api/auth/logout', { method: 'POST' }); }
    finally { location.href = '/'; }
  });
}

export async function initAccount(options = {}) {
  const account = await getAccount(options);
  if (account) bindLogout();
  return account;
}
