import { EXPENSE_IDS } from './methods.js';

/** Стоимость одной отработанной смены — все деньги, как и в остальном приложении, в копейках. */
export const SHIFT_RATE = 3_500 * 100;

/**
 * Подтверждённый пользователем итог на момент подключения зарплатного счётчика.
 * Это значение заменяет расчёт по старым оплатам только в одном расчётном периоде,
 * поэтому исторические записи не задваивают семь уже учтённых смен.
 */
export const SALARY_BASELINE = Object.freeze({
  asOf: '2026-09-15',
  shifts: 7,
});

/** Рабочий день определяется по московскому времени, даже если приложение открыто в поездке. */
export const SALARY_TIME_ZONE = 'Europe/Moscow';

const datePartsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALARY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Возвращает локальный ключ дня YYYY-MM-DD в часовом поясе расчёта зарплаты. */
export function salaryDayKey(date) {
  const parts = Object.fromEntries(
    datePartsFmt
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Уникальные рабочие дни до указанной даты включительно.
 * Несколько оплат в день дают одну смену, а запись «Траты» сменой не считается.
 */
export function workedDayKeys(payments, throughDay = '9999-12-31') {
  const days = new Set();

  for (const payment of payments) {
    if (!payment || EXPENSE_IDS.includes(payment.method)) continue;

    const stamp = new Date(payment.createdAt);
    if (Number.isNaN(stamp.getTime())) continue;

    const key = salaryDayKey(stamp);
    if (key <= throughDay) days.add(key);
  }

  return [...days].sort();
}

/** Расчётный период смены: 1–15 либо 16–последний день месяца. */
export function periodForWorkDay(dayKey) {
  const { year, month, day } = parseDayKey(dayKey);

  if (day <= 15) {
    return {
      start: makeDayKey(year, month, 1),
      end: makeDayKey(year, month, 15),
      payout: makeDayKey(year, month, Math.min(30, daysInMonth(year, month))),
    };
  }

  const next = moveMonth(year, month, 1);
  return {
    start: makeDayKey(year, month, 16),
    end: makeDayKey(year, month, daysInMonth(year, month)),
    payout: makeDayKey(next.year, next.month, 15),
  };
}

/**
 * Две (или больше) ближайшие даты после текущего дня. Если сегодня день
 * зарплаты, он считается уже наступившим, а первой показывается следующая.
 */
export function upcomingPayoutPeriods(referenceDate = new Date(), count = 2) {
  const referenceKey = salaryDayKey(referenceDate);
  const { year, month } = parseDayKey(referenceKey);
  const payouts = [];

  for (let offset = 0; payouts.length < count; offset += 1) {
    const cursor = moveMonth(year, month, offset);
    const monthPayouts = [
      makeDayKey(cursor.year, cursor.month, 15),
      makeDayKey(
        cursor.year,
        cursor.month,
        Math.min(30, daysInMonth(cursor.year, cursor.month)),
      ),
    ];

    for (const payout of monthPayouts) {
      if (payout > referenceKey) payouts.push(periodForPayout(payout));
      if (payouts.length === count) break;
    }
  }

  return payouts;
}

/** Итог одного периода на текущий момент. */
export function summarizeSalaryPeriod(
  payments,
  period,
  { throughDay = '9999-12-31', baseline = SALARY_BASELINE, shiftRate = SHIFT_RATE } = {},
) {
  const observedDays = workedDayKeys(payments, throughDay).filter(
    (key) => key >= period.start && key <= period.end,
  );

  const baselineApplies =
    baseline &&
    Number.isInteger(baseline.shifts) &&
    baseline.shifts >= 0 &&
    baseline.asOf >= period.start &&
    baseline.asOf <= period.end &&
    baseline.asOf <= throughDay;

  const addedAfterBaseline = baselineApplies
    ? observedDays.filter((key) => key > baseline.asOf)
    : [];
  const shifts = baselineApplies ? baseline.shifts + addedAfterBaseline.length : observedDays.length;

  return {
    ...period,
    shifts,
    amount: shifts * shiftRate,
    observedDays,
    baselineApplied: Boolean(baselineApplies),
    baselineShifts: baselineApplies ? baseline.shifts : 0,
    addedAfterBaseline,
  };
}

/** Всё, что нужно экрану: ближайшие выплаты и выплата, куда попадёт сегодняшняя смена. */
export function salaryOverview(payments, referenceDate = new Date(), payoutCount = 2) {
  const today = salaryDayKey(referenceDate);
  const summarize = (period) => summarizeSalaryPeriod(payments, period, { throughDay: today });

  return {
    today,
    payouts: upcomingPayoutPeriods(referenceDate, payoutCount).map(summarize),
    activePeriod: summarize(periodForWorkDay(today)),
    todayWorked: workedDayKeys(payments, today).includes(today),
  };
}

function periodForPayout(payout) {
  const { year, month, day } = parseDayKey(payout);

  if (day === 15) {
    const previous = moveMonth(year, month, -1);
    return {
      start: makeDayKey(previous.year, previous.month, 16),
      end: makeDayKey(previous.year, previous.month, daysInMonth(previous.year, previous.month)),
      payout,
    };
  }

  return {
    start: makeDayKey(year, month, 1),
    end: makeDayKey(year, month, 15),
    payout,
  };
}

function parseDayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) throw new TypeError(`Некорректная дата: ${key}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function makeDayKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** month — 1..12. */
function moveMonth(year, month, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
