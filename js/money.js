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

/** Компактная запись для подписей графика: 950, 1,5к, 12к, 1,2М. */
export function formatCompact(kopecks) {
  const rub = Math.round(kopecks / 100);
  if (rub < 1000) return String(rub);
  if (rub < 1_000_000) return `${trimZero(rub / 1000)}к`;
  return `${trimZero(rub / 1_000_000)}М`;
}

function trimZero(value) {
  const rounded = value < 10 ? value.toFixed(1) : String(Math.round(value));
  return rounded.replace('.0', '').replace('.', ',');
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

/** «1500,5» → «1 500,5»: группируем разряды, не трогая незакрытую дробную часть. */
export function formatDraft(draft) {
  if (draft === '') return '0';
  const [int = '', frac] = draft.split(',');
  const head = groupDigits(int === '' ? '0' : int);
  return frac === undefined ? head : `${head},${frac}`;
}
