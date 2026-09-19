const maxItems = 40;
const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const cleanList = (value, maxLen = 100) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(x => cleanText(x, maxLen)).filter(Boolean))].slice(0, maxItems);
};

export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('profile must be an object');
  const profile = {
    name: cleanText(input.name, 160),
    naics: cleanList(input.naics, 12).filter(x => /^\d{2,6}$/.test(x)),
    capabilities: cleanList(input.capabilities, 120),
    setAsides: cleanList(input.setAsides, 120),
    regions: cleanList(input.regions, 40),
    negativeKeywords: cleanList(input.negativeKeywords, 80),
    hardBlockers: cleanList(input.hardBlockers, 120)
  };
  if (!profile.name) throw new Error('company name is required');
  if (!profile.naics.length && !profile.capabilities.length) throw new Error('at least one NAICS code or capability is required');
  return profile;
}
