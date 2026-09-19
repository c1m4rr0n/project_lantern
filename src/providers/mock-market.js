import { readFile } from 'node:fs/promises';

export async function fetchMockMarketContext({ naics }) {
  const raw = await readFile(new URL('../../data/mock-market-context.json', import.meta.url), 'utf8');
  const all = JSON.parse(raw);
  return all[String(naics)] || { source: 'demo-fixture', naics: String(naics), sampleCount: 0, sampleValue: 0, averageAward: 0, topRecipients: [], awards: [] };
}
