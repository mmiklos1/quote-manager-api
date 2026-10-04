// country_of_origin is ISO 3166-1 alpha-2. Chosen while building F-007.
// An empty or unknown code does not resolve a currency.

const CURRENCY_BY_COUNTRY = {
  AE: 'AED',
  AT: 'EUR',
  AU: 'AUD',
  BE: 'EUR',
  BR: 'BRL',
  CA: 'CAD',
  CH: 'CHF',
  CN: 'CNY',
  DE: 'EUR',
  DK: 'DKK',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  HK: 'HKD',
  IE: 'EUR',
  IN: 'INR',
  IT: 'EUR',
  JP: 'JPY',
  KR: 'KRW',
  MX: 'MXN',
  NL: 'EUR',
  NO: 'NOK',
  NZ: 'NZD',
  PL: 'PLN',
  PT: 'EUR',
  SE: 'SEK',
  SG: 'SGD',
  US: 'USD',
  ZA: 'ZAR',
};

export function currencyForCountry(countryOfOrigin) {
  if (typeof countryOfOrigin !== 'string') {
    return null;
  }
  const code = countryOfOrigin.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return null;
  }
  return CURRENCY_BY_COUNTRY[code] ?? null;
}
