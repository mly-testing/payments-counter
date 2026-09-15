import { fromDayKey } from '../analytics.js';
import { formatMoney } from '../money.js';
import { SHIFT_RATE, salaryOverview } from '../salary.js';
import * as store from '../store.js';

export const title = 'Зарплата';

const payoutDateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
});
const periodDateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

export function subtitle() {
  const [next] = salaryOverview(store.getPayments()).payouts;
  return `Следующая выплата ${formatPayoutDate(next.payout)} · ${formatMoney(next.amount)}`;
}

export function mount(container) {
  container.innerHTML = '<div id="salary-content"></div>';
  const contentEl = container.querySelector('#salary-content');

  function render() {
    const overview = salaryOverview(store.getPayments());
    const [next, following] = overview.payouts;
    const active = overview.activePeriod;
    const activeIsNext = active.payout === next.payout;

    contentEl.innerHTML = `
      <section class="section salary-hero" aria-labelledby="salary-next-title">
        <div class="salary-hero__eyebrow" id="salary-next-title">Следующая выплата</div>
        <div class="salary-hero__date">${formatPayoutDate(next.payout)}</div>
        <div class="salary-hero__amount">${formatMoney(next.amount)}</div>
        <div class="salary-hero__formula">
          ${formatShiftCount(next.shifts)} × ${formatMoney(SHIFT_RATE)}
        </div>
        <div class="salary-hero__period">За смены ${formatPeriod(next)}</div>
      </section>

      <section class="section">
        <div class="section__title">${activeIsNext ? 'Сегодня' : 'Куда попадёт сегодняшняя смена'}</div>
        ${currentShiftStatus(overview, activeIsNext ? next : active)}
      </section>

      <section class="section">
        <div class="section__title">После неё</div>
        ${payoutCard(following)}
      </section>

      <section class="section">
        <div class="card salary-rules">
          <div class="salary-rules__title">Как считается смена</div>
          <p>Один день с хотя бы одной оплатой — одна смена стоимостью ${formatMoney(SHIFT_RATE)}.</p>
          <p>QR, карта и наличные засчитываются. Несколько оплат в один день не увеличивают число смен, а запись «Траты» сама по себе смену не создаёт.</p>
          <div class="salary-rules__periods">
            <span>1–15 → выплата 30-го</span>
            <span>16–конец месяца → выплата 15-го</span>
          </div>
        </div>
      </section>`;
  }

  return { update: render, destroy() {} };
}

function currentShiftStatus(overview, payout) {
  const statusClass = overview.todayWorked ? 'salary-status--worked' : '';
  const icon = overview.todayWorked ? '✓' : '○';
  const title = overview.todayWorked ? 'Сегодняшняя смена засчитана' : 'Сегодня смена ещё не засчитана';
  const note = overview.todayWorked
    ? `Она уже входит в выплату ${formatPayoutDate(payout.payout)}.`
    : 'Она появится здесь после первой входящей оплаты за сегодня.';

  return `
    <div class="card salary-status ${statusClass}">
      <span class="salary-status__icon" aria-hidden="true">${icon}</span>
      <span class="salary-status__body">
        <strong>${title}</strong>
        <span>${note}</span>
      </span>
      ${overview.activePeriod.payout !== overview.payouts[0].payout ? `<strong class="salary-status__date">${formatPayoutDate(payout.payout)}</strong>` : ''}
    </div>`;
}

function payoutCard(payout) {
  return `
    <div class="card salary-payout">
      <div>
        <div class="salary-payout__date">${formatPayoutDate(payout.payout)}</div>
        <div class="salary-payout__period">Смены ${formatPeriod(payout)}</div>
      </div>
      <div class="salary-payout__total">
        <strong>${formatMoney(payout.amount)}</strong>
        <span>${formatShiftCount(payout.shifts)}</span>
      </div>
    </div>`;
}

function formatPayoutDate(key) {
  return payoutDateFmt.format(fromDayKey(key));
}

function formatPeriod({ start, end }) {
  return `${periodDateFmt.format(fromDayKey(start))} — ${periodDateFmt.format(fromDayKey(end))}`;
}

function formatShiftCount(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? 'смен' : mod10 === 1 ? 'смена' : mod10 >= 2 && mod10 <= 4 ? 'смены' : 'смен';
  return `${count} ${word}`;
}
