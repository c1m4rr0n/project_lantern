export const DEFAULT_PRODUCT_NAME = 'ExcluSignal';
export const DEFAULT_TAGLINE = 'Federal vendor exclusion monitoring with evidence.';

export function productName(env = process.env) {
  const value=String(env.PRODUCT_NAME || DEFAULT_PRODUCT_NAME).trim();
  return value || DEFAULT_PRODUCT_NAME;
}
