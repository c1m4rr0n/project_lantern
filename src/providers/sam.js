const TYPE_LABELS = {
  o: 'Solicitation',
  k: 'Combined Synopsis/Solicitation',
  r: 'Sources Sought',
  p: 'Presolicitation',
  s: 'Special Notice',
  a: 'Award Notice',
  u: 'Justification',
  g: 'Sale of Surplus Property',
  i: 'Intent to Bundle Requirements'
};

function fmt(date) {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${m}/${d}/${date.getUTCFullYear()}`;
}


function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = scalar(item);
      if (resolved) return resolved;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['code','name','value','abbreviation']) {
      const resolved = scalar(value[key]);
      if (resolved) return resolved;
    }
  }
  return '';
}

function asNaics(value) {
  if (Array.isArray(value)) return value.map(String).filter(x => /^\d{2,6}$/.test(x));
  return String(value || '').split(/[,;\s]+/).filter(x => /^\d{2,6}$/.test(x));
}

function compactContact(contact) {
  if (!contact || typeof contact !== 'object') return null;
  return {
    type: contact.type || '',
    title: contact.title || '',
    fullName: contact.fullName || contact.fullname || '',
    email: contact.email || '',
    phone: contact.phone || ''
  };
}

export function normalizeSamOpportunity(item) {
  const pop = item.placeOfPerformance || {};
  const rawType = item.type || '';
  const descriptionUrl = typeof item.description === 'string' && /^https:\/\//i.test(item.description.trim())
    ? item.description.trim()
    : '';
  return {
    id: item.noticeId || item.noticeid || item.solicitationNumber,
    source: 'sam.gov',
    sourceUrl: item.uiLink && item.uiLink !== 'null' ? item.uiLink : '',
    solicitationNumber: item.solicitationNumber || '',
    title: item.title || 'Untitled opportunity',
    description: descriptionUrl ? '' : (typeof item.description === 'string' ? item.description : ''),
    descriptionUrl,
    type: TYPE_LABELS[rawType] || rawType || 'Opportunity',
    postedDate: item.postedDate || null,
    deadline: item.responseDeadLine || item.responseDeadline || item.reponseDeadLine || null,
    naics: asNaics(item.naicsCode || item.naics || ''),
    classificationCode: item.classificationCode || '',
    setAside: item.typeOfSetAsideDescription || item.setAside || item.typeOfSetAside || '',
    setAsideCode: item.typeOfSetAside || item.setAsideCode || '',
    placeOfPerformance: {
      state: scalar(pop.state?.code) || scalar(pop.state?.name) || scalar(pop.state) || scalar(item.state),
      city: scalar(pop.city?.name) || scalar(pop.city),
      zip: scalar(pop.zip)
    },
    agency: item.fullParentPathName || item.department || item.subTier || '',
    active: String(item.active || '').toLowerCase() !== 'no',
    contacts: (Array.isArray(item.pointOfContact) ? item.pointOfContact : []).map(compactContact).filter(Boolean),
    resourceLinks: Array.isArray(item.resourceLinks) ? item.resourceLinks.filter(Boolean) : [],
    requirements: []
  };
}

export function buildSamSearchUrl({ apiKey, lookbackDays = 2, limit = 100, offset = 0, now = new Date() }) {
  if (!apiKey) throw new Error('SAM_API_KEY is required for live provider');
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - Number(lookbackDays));

  const url = new URL('https://api.sam.gov/opportunities/v2/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('postedFrom', fmt(from));
  url.searchParams.set('postedTo', fmt(to));
  url.searchParams.set('limit', String(Math.min(1000, Math.max(1, Number(limit) || 100))));
  url.searchParams.set('offset', String(Math.max(0, Number(offset) || 0)));
  return url;
}

export async function fetchSamOpportunities({ apiKey, lookbackDays = 2, limit = 100, now = new Date(), fetchImpl = fetch }) {
  const url = buildSamSearchUrl({ apiKey, lookbackDays, limit, now });
  const response = await fetchImpl(url, { headers: { 'user-agent': 'ExcluSignal/0.9 procurement-research' } });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`SAM.gov request failed: ${response.status}${body ? ` ${body}` : ''}`);
  }
  const data = await response.json();
  return (data.opportunitiesData || []).map(normalizeSamOpportunity).filter(x => x.id);
}
