const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

export function getMetaCurrencyScale(currency = 'USD') {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency).toUpperCase()) ? 1 : 100;
}

export function fromMetaBudget(rawAmount, currency = 'USD') {
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') return null;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) return null;
  return amount / getMetaCurrencyScale(currency);
}

export function toMetaBudget(displayAmount, currency = 'USD') {
  const amount = Number(displayAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ngân sách phải lớn hơn 0.');
  return Math.round(amount * getMetaCurrencyScale(currency));
}

export function formatAccountCurrency(value, currency = 'VND') {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency || 'VND',
    maximumFractionDigits: getMetaCurrencyScale(currency) === 1 ? 0 : 2
  }).format(amount);
}

export function parseBudgetInput(value, currency = 'VND') {
  const raw = String(value ?? '').trim();
  if (!raw) return Number.NaN;

  if (getMetaCurrencyScale(currency) === 1) {
    const digits = raw.replace(/\D/g, '');
    return digits ? Number(digits) : Number.NaN;
  }

  const compact = raw.replace(/\s/g, '').replace(/[^\d.,]/g, '');
  if (!compact) return Number.NaN;
  const separatorIndex = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf(','));
  if (separatorIndex === -1) return Number(compact);

  const decimalLength = compact.length - separatorIndex - 1;
  const digits = compact.replace(/[.,]/g, '');
  if (decimalLength === 0 || decimalLength > 2) return Number(digits);
  return Number(`${digits.slice(0, -decimalLength) || '0'}.${digits.slice(-decimalLength)}`);
}
