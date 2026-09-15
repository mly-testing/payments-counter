import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHIFT_RATE,
  periodForWorkDay,
  salaryDayKey,
  salaryOverview,
  summarizeSalaryPeriod,
  upcomingPayoutPeriods,
  workedDayKeys,
} from '../js/salary.js';

function payment(day, method = 'cash', id = `${day}-${method}`) {
  return {
    id,
    method,
    amount: 100_00,
    // Полдень Москвы: дата не зависит от перехода через UTC-полночь.
    createdAt: `${day}T09:00:00.000Z`,
  };
}

function atMoscowNoon(day) {
  return new Date(`${day}T12:00:00+03:00`);
}

test('несколько входящих оплат в день дают одну смену, а траты не дают смену', () => {
  const payments = [
    payment('2026-09-01', 'qr', '1'),
    payment('2026-09-01', 'cash', '2'),
    payment('2026-09-02', 'spend', '3'),
    payment('2026-09-03', 'spend', '4'),
    payment('2026-09-03', 'card', '5'),
  ];

  assert.deepEqual(workedDayKeys(payments), ['2026-09-01', '2026-09-03']);
});

test('рабочий день определяется в часовом поясе Москвы', () => {
  assert.equal(salaryDayKey(new Date('2026-09-14T21:00:00.000Z')), '2026-09-15');
  assert.equal(salaryDayKey(new Date('2026-09-15T20:59:59.000Z')), '2026-09-15');
  assert.equal(salaryDayKey(new Date('2026-09-15T21:00:00.000Z')), '2026-09-16');
});

test('15-е относится к первой половине, а 16-е — ко второй', () => {
  assert.deepEqual(periodForWorkDay('2026-09-15'), {
    start: '2026-09-01',
    end: '2026-09-15',
    payout: '2026-09-30',
  });
  assert.deepEqual(periodForWorkDay('2026-09-16'), {
    start: '2026-09-16',
    end: '2026-09-30',
    payout: '2026-10-15',
  });
});

test('конец месяца и года корректно переходит к выплате 15-го', () => {
  assert.deepEqual(periodForWorkDay('2026-08-31'), {
    start: '2026-08-16',
    end: '2026-08-31',
    payout: '2026-09-15',
  });
  assert.deepEqual(periodForWorkDay('2026-12-31'), {
    start: '2026-12-16',
    end: '2026-12-31',
    payout: '2027-01-15',
  });
});

test('в феврале выплата вместо 30-го приходится на последний день месяца', () => {
  assert.equal(periodForWorkDay('2026-02-15').payout, '2026-02-28');
  assert.equal(periodForWorkDay('2028-02-15').payout, '2028-02-29');
});

test('в день зарплаты первой считается следующая дата выплаты', () => {
  assert.deepEqual(
    upcomingPayoutPeriods(atMoscowNoon('2026-09-15')).map(({ payout }) => payout),
    ['2026-09-30', '2026-10-15'],
  );
  assert.deepEqual(
    upcomingPayoutPeriods(atMoscowNoon('2026-09-30')).map(({ payout }) => payout),
    ['2026-10-15', '2026-10-30'],
  );
});

test('подтверждённый стартовый итог заменяет старые дни и не задваивает их', () => {
  const period = periodForWorkDay('2026-09-15');
  const payments = Array.from({ length: 10 }, (_unused, index) =>
    payment(`2026-09-${String(index + 1).padStart(2, '0')}`, 'cash', String(index)),
  );
  const summary = summarizeSalaryPeriod(payments, period, { throughDay: '2026-09-15' });

  assert.equal(summary.baselineApplied, true);
  assert.equal(summary.shifts, 7);
  assert.equal(summary.amount, 7 * SHIFT_RATE);
});

test('после даты стартового итога добавляются только новые уникальные рабочие дни', () => {
  const period = periodForWorkDay('2026-09-15');
  const payments = [
    payment('2026-09-02', 'cash', 'old'),
    payment('2026-09-11', 'qr', 'new-1'),
    payment('2026-09-11', 'card', 'new-duplicate'),
    payment('2026-09-12', 'spend', 'expense'),
  ];
  const summary = summarizeSalaryPeriod(payments, period, {
    throughDay: '2026-09-15',
    baseline: { asOf: '2026-09-10', shifts: 4 },
  });

  assert.equal(summary.shifts, 5);
  assert.deepEqual(summary.addedAfterBaseline, ['2026-09-11']);
});

test('семь смен на 15 сентября дают 24 500 ₽ к выплате 30 сентября', () => {
  const overview = salaryOverview([], atMoscowNoon('2026-09-15'));
  const [next] = overview.payouts;

  assert.equal(next.payout, '2026-09-30');
  assert.equal(next.shifts, 7);
  assert.equal(next.amount, 2_450_000);
});

test('стартовые семь смен не переносятся в следующий расчётный период', () => {
  const overview = salaryOverview([], atMoscowNoon('2026-10-01'));

  assert.equal(overview.payouts[0].payout, '2026-10-15');
  assert.equal(overview.payouts[0].shifts, 0);
  assert.equal(overview.payouts[0].baselineApplied, false);
});

test('после 15-го ближайшая выплата и выплата за текущую смену различаются', () => {
  const payments = [payment('2026-09-10'), payment('2026-09-20')];
  const overview = salaryOverview(payments, atMoscowNoon('2026-09-20'));

  assert.equal(overview.payouts[0].payout, '2026-09-30');
  assert.equal(overview.activePeriod.payout, '2026-10-15');
  assert.equal(overview.activePeriod.shifts, 1);
  assert.equal(overview.todayWorked, true);
});

test('будущая запись не увеличивает ожидаемую сумму раньше времени', () => {
  const payments = [payment('2026-10-01')];
  const overview = salaryOverview(payments, atMoscowNoon('2026-09-20'), 3);

  assert.equal(overview.payouts[1].shifts, 0);
  assert.equal(overview.payouts[2].shifts, 0);
  assert.equal(overview.activePeriod.shifts, 0);
});
