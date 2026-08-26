import { daysWithPayments, formatDayLabel } from '../analytics.js';
import { delegate } from '../components/dom.js';
import { rowMarkup } from '../components/payment-rows.js';
import { SHEET_API } from '../config.js';
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
      Полный список оплат из Google Таблицы. Изменить или удалить запись можно
      на вкладке «Статистика», а правки, внесённые в таблице руками, появятся
      здесь после обновления.
    </p>`;

  const listEl = container.querySelector('#history-list');

  function render() {
    const payments = store.getPayments();

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

  delegate(container, '[data-action="refresh"]', 'click', () => {
    store.refresh().catch(() => {
      // Полоса состояния под шапкой уже сообщила о проблеме.
    });
  });

  return { update: render, destroy() {} };
}

function dayGroupMarkup({ key, payments, totals }) {
  return `
    <div class="list__group-title">
      <span class="list__group-day">${formatDayLabel(key)}</span>
      <span class="list__group-total">${formatMoney(totals.total)}</span>
    </div>
    <div class="card list">${payments.map((payment) => rowMarkup(payment)).join('')}</div>`;
}
