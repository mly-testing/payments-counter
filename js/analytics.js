import { CASHLESS_IDS, METHOD_IDS } from './methods.js';

/**
 * Агрегации и работа с датами. День определяется по местному времени телефона,
 * поэтому «сегодня» у пользователя и в отчёте — это один и тот же день.
 */

const dayMonthFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/* ==========================================================================
   Даты
   ========================================================================== */

/** Локальный ключ дня «YYYY-MM-DD». UTC-методы здесь использовать нельзя. */
export function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toDayKey(new Date());
}

/** Ключи последних n дней, от самого старого к самому свежему. */
export function lastDayKeys(count) {
  const keys = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (count - 1));

  for (let i = 0; i < count; i += 1) {
    keys.push(toDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** «Сегодня, 26 августа» / «Вчера, 25 августа» / «24 августа, сб». */
export function formatDayLabel(key) {
  const date = fromDayKey(key);
  const base = dayMonthFmt.format(date);
  const diff = daysFromToday(key);

  if (diff === 0) return `Сегодня, ${base}`;
  if (diff === -1) return `Вчера, ${base}`;
  return `${base}, ${weekdayFmt.format(date)}`;
}

/** «26.08» — для оси графика. */
export function formatDayShort(key) {
  const [, month, day] = key.split('-');
  return `${day}.${month}`;
}

export function formatWeekday(key) {
  return weekdayFmt.format(fromDayKey(key)).replace('.', '');
}

export function formatTime(iso) {
  return timeFmt.format(new Date(iso));
}

export function formatRangeLabel(keys) {
  if (keys.length === 0) return '';
  const first = formatDayShort(keys[0]);
  const last = formatDayShort(keys[keys.length - 1]);
  return first === last ? first : `${first} — ${last}`;
}

function daysFromToday(key) {
  const MS_PER_DAY = 86_400_000;
  const target = fromDayKey(key).getTime();
  const today = fromDayKey(todayKey()).getTime();
  return Math.round((target - today) / MS_PER_DAY);
}

/* ==========================================================================
   Итоги
   ========================================================================== */

function emptyBuckets() {
  return Object.fromEntries(METHOD_IDS.map((id) => [id, 0]));
}

/**
 * @typedef {{byMethod: Record<string, number>, cashless: number, cash: number,
 *            total: number, count: number}} Totals
 */

/** @returns {Totals} */
export function totalsOf(payments) {
  const byMethod = emptyBuckets();
  let total = 0;

  for (const payment of payments) {
    byMethod[payment.method] = (byMethod[payment.method] ?? 0) + payment.amount;
    total += payment.amount;
  }

  const cashless = CASHLESS_IDS.reduce((sum, id) => sum + byMethod[id], 0);
  return { byMethod, cashless, cash: total - cashless, total, count: payments.length };
}

/** Группировка по локальным дням: ключ дня → платежи, от новых к старым. */
export function groupByDay(payments) {
  const groups = new Map();

  for (const payment of payments) {
    const key = toDayKey(new Date(payment.createdAt));
    const bucket = groups.get(key);
    if (bucket) bucket.push(payment);
    else groups.set(key, [payment]);
  }
  return groups;
}

/**
 * Ряд данных для графика: по одной точке на каждый день диапазона,
 * включая дни без оплат — иначе столбцы «слипаются» и картина искажается.
 *
 * @returns {Array<Totals & {key: string}>}
 */
export function dailySeries(payments, dayKeys) {
  const groups = groupByDay(payments);
  return dayKeys.map((key) => ({ key, ...totalsOf(groups.get(key) ?? []) }));
}

export function paymentsOfDay(payments, key) {
  return payments.filter((payment) => toDayKey(new Date(payment.createdAt)) === key);
}

/** Дни с оплатами, от свежих к старым — для экрана истории. */
export function daysWithPayments(payments) {
  return [...groupByDay(payments).entries()].map(([key, items]) => ({
    key,
    payments: items,
    totals: totalsOf(items),
  }));
}
