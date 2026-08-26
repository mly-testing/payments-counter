import {
  dailySeries,
  formatDayLabel,
  formatRangeLabel,
  formatTime,
  lastDayKeys,
  paymentsOfDay,
  toDayKey,
  todayKey,
  totalsOf,
} from '../analytics.js';
import { renderChart, renderLegend } from '../components/chart.js';
import { delegate } from '../components/dom.js';
import { renderBreakdown, renderTotals } from '../components/totals.js';
import { CASHLESS_LABEL, getMethod } from '../methods.js';
import { formatMoney } from '../money.js';
import * as store from '../store.js';

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: '30 дней' },
];

/** Выбор периода и выделенный день переживают переключение вкладок. */
let periodDays = 7;
let selectedDay = null;

export const title = 'Статистика';

export function subtitle() {
  return `Период: ${formatRangeLabel(lastDayKeys(periodDays))}`;
}

export function mount(container) {
  container.innerHTML = `
    <div class="segmented" id="period" role="tablist" aria-label="Период">
      ${PERIODS.map(
        (period) => `
        <button class="segmented__btn" type="button" role="tab"
                data-days="${period.days}">${period.label}</button>`,
      ).join('')}
    </div>

    <div class="section" id="day-detail"></div>

    <div class="section">
      <div class="section__title">Суммы по дням</div>
      <div class="card chart-card" id="chart-card"></div>
    </div>

    <div class="section" id="period-totals"></div>`;

  const periodEl = container.querySelector('#period');
  const totalsEl = container.querySelector('#period-totals');
  const chartEl = container.querySelector('#chart-card');
  const detailEl = container.querySelector('#day-detail');

  function render() {
    const dayKeys = lastDayKeys(periodDays);
    const inPeriod = new Set(dayKeys);
    const payments = store.getPayments();
    const periodPayments = payments.filter((payment) =>
      inPeriod.has(toDayKey(new Date(payment.createdAt))),
    );

    for (const button of periodEl.children) {
      button.setAttribute('aria-selected', String(Number(button.dataset.days) === periodDays));
    }

    totalsEl.innerHTML = `
      <div class="section__title">Итого за ${formatRangeLabel(dayKeys)}</div>
      ${renderTotals(totalsOf(periodPayments))}`;

    const activeKey = inPeriod.has(selectedDay ?? '') ? selectedDay : todayKey();
    chartEl.innerHTML = `
      ${renderChart(dailySeries(periodPayments, dayKeys), { activeKey })}
      ${renderLegend()}
      <p class="hint-inline">Нажмите на столбец — детали этого дня появятся выше</p>`;

    detailEl.innerHTML = dayDetailMarkup(payments, activeKey);
  }

  delegate(container, '.segmented__btn', 'click', (_event, button) => {
    periodDays = Number(button.dataset.days);
    render();
    document.dispatchEvent(new CustomEvent('view:header-changed'));
  });

  delegate(container, '.chart__hit', 'click', (_event, hit) => {
    selectedDay = hit.dataset.day;
    render();
  });

  return { update: render, destroy() {} };
}

/* ==========================================================================
   Детали выбранного дня
   ========================================================================== */

function dayDetailMarkup(payments, dayKey) {
  const dayPayments = paymentsOfDay(payments, dayKey);
  const totals = totalsOf(dayPayments);

  const summary = `
    <div class="card card--pad">
      ${renderBreakdown(totals)}
      <div class="kv">
        <span class="kv__label">Безнал, ${CASHLESS_LABEL}</span>
        <span class="kv__value">${formatMoney(totals.cashless)}</span>
      </div>
      <div class="kv kv--strong">
        <span class="kv__label">Всего за день</span>
        <span class="kv__value">${formatMoney(totals.total)}</span>
      </div>
    </div>`;

  const operations = dayPayments.length === 0
    ? `<div class="card empty"><span class="empty__emoji">📭</span>В этот день оплат не было</div>`
    : `<div class="card list">${dayPayments.map(rowMarkup).join('')}</div>`;

  return `
    <div class="list__group-title">
      <span class="list__group-day">${formatDayLabel(dayKey)}</span>
      <span class="list__group-total">${formatMoney(totals.total)}</span>
    </div>
    ${summary}
    <div class="section">
      <div class="section__title">Операции этого дня</div>
      ${operations}
    </div>`;
}

function rowMarkup(payment) {
  const method = getMethod(payment.method);
  return `
    <div class="row" style="--dot: ${method.color}">
      <span class="row__marker" aria-hidden="true"></span>
      <span class="row__body">
        <span class="row__title">${method.title}</span>
        <span class="row__time">🕒 ${formatTime(payment.createdAt)}</span>
      </span>
      <span class="row__amount">${formatMoney(payment.amount)}</span>
    </div>`;
}
