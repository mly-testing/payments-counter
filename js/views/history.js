import { describeError } from '../api.js';
import { daysWithPayments, formatDayLabel, formatTime, totalsOf } from '../analytics.js';
import { delegate, haptic } from '../components/dom.js';
import { renderTotals } from '../components/totals.js';
import { showError, showToast } from '../components/toast.js';
import { SHEET_API } from '../config.js';
import { getMethod } from '../methods.js';
import { formatMoney } from '../money.js';
import * as store from '../store.js';

export const title = 'История';

export function subtitle() {
  if (store.getStatus() === store.Status.Loading && store.getCount() === 0) {
    return 'Читаю таблицу…';
  }
  const count = store.getCount();
  return count === 0 ? 'В таблице пока пусто' : `Записей в таблице: ${count}`;
}

export function mount(container) {
  container.innerHTML = `
    <div class="section" id="history-totals"></div>
    <div class="section">
      <div class="section__title">Все операции</div>
      <div id="history-list"></div>
    </div>
    <div class="actions">
      <button class="btn" type="button" data-action="refresh">🔄 Обновить</button>
      ${
        SHEET_API.sheetUrl
          ? `<a class="btn" href="${SHEET_API.sheetUrl}" target="_blank" rel="noopener">📗 Открыть таблицу</a>`
          : '<button class="btn" type="button" disabled>📗 Ссылка не задана</button>'
      }
    </div>
    <p class="hint-inline">
      Все записи живут в Google Таблице. Удаление здесь удаляет строку и в ней,
      а изменения, внесённые в таблице руками, появятся тут после обновления.
    </p>`;

  const totalsEl = container.querySelector('#history-totals');
  const listEl = container.querySelector('#history-list');

  function render() {
    const payments = store.getPayments();

    totalsEl.innerHTML = `
      <div class="section__title">За всё время</div>
      ${renderTotals(totalsOf(payments))}`;

    if (payments.length > 0) {
      listEl.innerHTML = daysWithPayments(payments).map(dayGroupMarkup).join('');
      return;
    }

    listEl.innerHTML =
      store.getStatus() === store.Status.Loading
        ? '<div class="card empty"><span class="spinner spinner--lg"></span>Читаю таблицу…</div>'
        : `<div class="card empty">
             <span class="empty__emoji">🧾</span>
             Здесь появятся все оплаты из таблицы с точным временем.
           </div>`;
  }

  delegate(container, '.row__delete', 'click', async (_event, button) => {
    const { id } = button.dataset;
    const payment = store.getPayment(id);
    if (!payment || button.disabled) return;

    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>';

    try {
      await store.removePayment(id);
      haptic(12);
      showToast({
        title: 'Запись удалена',
        subtitle: `${getMethod(payment.method).title} · ${formatMoney(payment.amount)}`,
        tone: 'var(--danger)',
      });
    } catch (error) {
      showError('Не удалось удалить', describeError(error));
      render();
    }
  });

  delegate(container, '[data-action="refresh"]', 'click', () => {
    store.refresh().catch(() => {
      // Полоса состояния под шапкой уже сообщила о проблеме.
    });
  });

  return { update: render, destroy() {} };
}

function dayGroupMarkup({ key, payments, totals }) {
  const rows = payments.map(rowMarkup).join('');
  return `
    <div class="list__group-title">
      <span class="list__group-day">${formatDayLabel(key)}</span>
      <span class="list__group-total">${formatMoney(totals.total)}</span>
    </div>
    <div class="card list">${rows}</div>`;
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
      <button class="row__delete" type="button" data-id="${payment.id}" aria-label="Удалить запись">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`;
}
