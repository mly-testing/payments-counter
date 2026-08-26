/**
 * Все суммы внутри приложения — целое число копеек.
 * Это избавляет от ошибок округления, неизбежных при работе с float.
 */
export const CURRENCY = '₽';

const MAX_INTEGER_DIGITS = 9;
const NBSP = '\u00A0';

/** 150050 → «1 500,50». Копейки скрываются, когда они нулевые. */
export function formatMoney(kopecks, { withCurrency = true } = {}) {
  const negative = kopecks < 0;
  const whole = Math.floor(Math.abs(kopecks) / 100);
  const cents = Math.abs(kopecks) % 100;

  let out = groupDigits(String(whole));
  if (cents > 0) out += `,${String(cents).padStart(2, '0')}`;
  if (negative) out = `−${out}`;
  return withCurrency ? `${out}${NBSP}${CURRENCY}` : out;
}

function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/* ==========================================================================
   Ввод с цифровой клавиатуры
   ========================================================================== */

/**
 * Черновик суммы — строка из цифр с необязательной запятой, например «1500,5».
 * Хранится как есть, чтобы «1500,» на экране не превращалось в «1500».
 */
export const EMPTY_DRAFT = '';

export function pushDigit(draft, digit) {
  const [int = '', frac] = draft.split(',');

  if (frac !== undefined) {
    if (frac.length >= 2) return draft;
    return `${int},${frac}${digit}`;
  }
  if (digit === '0' && int === '') return draft;
  if (int.length >= MAX_INTEGER_DIGITS) return draft;
  return int + digit;
}

export function pushSeparator(draft) {
  if (draft === '') return '0,';
  return draft.includes(',') ? draft : `${draft},`;
}

export function popDigit(draft) {
  return draft.slice(0, -1);
}

export function draftToKopecks(draft) {
  if (draft === '') return 0;
  const [int = '0', frac = ''] = draft.split(',');
  const rubles = Number.parseInt(int || '0', 10);
  const cents = Number.parseInt(frac.padEnd(2, '0'), 10) || 0;
  return rubles * 100 + cents;
}

/* ==========================================================================
   Ввод в обычное поле — правка суммы у сохранённой записи
   ========================================================================== */

/** 150050 → «1500,50». Без разделителей разрядов: строку предстоит править руками. */
export function kopecksToInput(kopecks) {
  const whole = Math.floor(kopecks / 100);
  const cents = kopecks % 100;
  return cents === 0 ? String(whole) : `${whole},${String(cents).padStart(2, '0')}`;
}

/** «1 500.5» → 150050. null, если это не сумма больше нуля. */
export function parseAmountInput(text) {
  const cleaned = String(text)
    .replace(/[\s\u00A0]/g, '')
    .replace(',', '.');

  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;

  const kopecks = Math.round(Number(cleaned) * 100);
  return kopecks > 0 ? kopecks : null;
}

/** «1500,5» → «1 500,5»: группируем разряды, не трогая незакрытую дробную часть. */
export function formatDraft(draft) {
  if (draft === '') return '0';
  const [int = '', frac] = draft.split(',');
  const head = groupDigits(int === '' ? '0' : int);
  return frac === undefined ? head : `${head},${frac}`;
}
