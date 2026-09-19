import { fetchSamOpportunities } from '../src/providers/sam.js';

const key = process.env.SAM_API_KEY;
if (!key) {
  console.error('SAM_API_KEY is not configured.');
  process.exitCode = 2;
} else {
  try {
    const items = await fetchSamOpportunities({ apiKey:key, lookbackDays:1, limit:1 });
    console.log(JSON.stringify({ ok:true, provider:'sam.gov', recordsReceived:items.length, secretPrinted:false }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok:false, provider:'sam.gov', error:error.message, secretPrinted:false }, null, 2));
    process.exitCode = 1;
  }
}
