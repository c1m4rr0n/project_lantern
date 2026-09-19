function iso(date) { return date.toISOString().slice(0, 10); }

export function buildUsaSpendingAwardRequest({ naics, years = 3, limit = 10, now = new Date() }) {
  if (!naics) throw new Error('naics is required');
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - Number(years));
  return {
    spending_level: 'awards',
    fields: ['Award ID','Recipient Name','Start Date','End Date','Award Amount','Awarding Agency','Awarding Sub Agency','Contract Award Type'],
    sort: 'Award Amount',
    order: 'desc',
    limit: Math.min(100, Math.max(1, Number(limit))),
    page: 1,
    filters: {
      award_type_codes: ['A','B','C','D'],
      naics_codes: [String(naics)],
      time_period: [{ start_date: iso(start), end_date: iso(end) }]
    }
  };
}

export function summarizeAwards(results = []) {
  const valid = results.filter(Boolean);
  const values = valid.map(r => Number(r['Award Amount'] || 0)).filter(Number.isFinite);
  const byRecipient = new Map();
  for (const row of valid) {
    const name = row['Recipient Name'] || 'Unknown recipient';
    byRecipient.set(name, (byRecipient.get(name) || 0) + Number(row['Award Amount'] || 0));
  }
  const topRecipients = [...byRecipient.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name, amount])=>({name,amount}));
  return {
    sampleCount: valid.length,
    sampleValue: values.reduce((a,b)=>a+b,0),
    averageAward: values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0,
    topRecipients
  };
}

export async function fetchUsaSpendingContext({ naics, years = 3, limit = 10, now = new Date() }) {
  const request = buildUsaSpendingAwardRequest({ naics, years, limit, now });
  const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'ExcluSignal/0.2 market-context' },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error(`USAspending request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return { source: 'usaspending.gov', naics: String(naics), ...summarizeAwards(data.results || []), awards: data.results || [] };
}
