import { readFile } from 'node:fs/promises';

export async function fetchMockOpportunities() {
  const raw = await readFile(new URL('../../data/mock-opportunities.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}
