import { daysWithPayments, formatDayLabel, formatTime, totalsOf } from '../analytics.js';
import { delegate, haptic } from '../components/dom.js';
import { plural, renderTotals } from '../components/totals.js';
import { showError, showToast } from '../components/toast.js';
import { exportCsv, exportJson, importJson } from '../export.js';
import { getMethod } from '../methods.js';
import { formatMoney } from '../money.js';
import * as store from '../store.js';

export const title = 'История';

export function subtitle() {
  const count = store.getCount();
  return count === 0 ? 'Пока ничего не сохранено' : `Всего записей: ${count}`;
}

export function mount(container) {
  container.innerHTML = `
    <div class="section" id="history-totals"></div>
    <div class="section">
      <div class="section__title">Все операции</div>
      <div id="history-list"></div>
    </div>
    <div class="actions">
      <button class="btn" type="button" data-action="csv">📄 Экспорт CSV</button>
      <button class="btn" type="button" data-action="backup">💾 Резервная копия</button>
      <button class="btn" type="button" data-action="restore">📥 Восстановить</button>
      <button class="btn btn--danger" type="button" data-action="clear">🗑 Удалить всё</button>
    </div>
    <p class="hint-inline">
      Данные хранятся только в этом браузере. Резервная копия — единственный способ
      не потерять их при очистке данных Safari или смене телефона.
    </p>
    <input type="file" id="restore-input" accept="application/json" hidden>`;

  const totalsEl = container.querySelector('#history-totals');
  const listEl = container.querySelector('#history-list');
  const fileInput = container.querySelector('#restore-input');

  function render() {
    const payments = store.getPayments();
    const overall = totalsOf(payments);

    totalsEl.innerHTML = `
      <div class="section__title">За всё время</div>
      ${renderTotals(overall)}`;

    listEl.innerHTML = payments.length === 0
      ? `<div class="card empty">
           <span class="empty__emoji">🧾</span>
           Здесь появятся все оплаты с точным временем.
         </div>`
      : daysWithPayments(payments).map(dayGroupMarkup).join('');
  }

  delegate(container, '.row__delete', 'click', (_event, button) => {
    const { id } = button.dataset;
    const payment = store.getPayment(id);
    if (!payment) return;

    try {
      store.removePayment(id);
    } catch {
      showError('Не удалось удалить запись');
      return;
    }
    haptic(12);
    showToast({
      title: 'Запись удалена',
      subtitle: `${getMethod(payment.method).title} · ${formatMoney(payment.amount)}`,
      tone: 'var(--danger)',
    });
  });

  delegate(container, '[data-action]', 'click', (_event, button) => {
    const { action } = button.dataset;

    if (action === 'csv') {
      handleExport(() => exportCsv(store.getPayments()), 'Файл CSV готов');
    } else if (action === 'backup') {
      handleExport(() => exportJson(store.getPayments()), 'Резервная копия сохранена');
    } else if (action === 'restore') {
      fileInput.click();
    } else if (action === 'clear') {
      confirmClear();
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      const restored = store.replaceAll(await importJson(file));
      showToast({ title: 'Данные восстановлены', subtitle: plural(restored) });
    } catch {
      showError('Не удалось прочитать файл', 'Нужен JSON, созданный этим приложением');
    }
  });

  return { update: render, destroy() {} };
}

function handleExport(run, successTitle) {
  try {
    run();
    showToast({ title: successTitle });
  } catch {
    showError('Не удалось выгрузить файл');
  }
}

function confirmClear() {
  const count = store.getCount();
  if (count === 0) {
    showError('Удалять нечего');
    return;
  }
  const confirmed = window.confirm(
    `Удалить все записи (${plural(count)})? Отменить это действие будет нельзя.`,
  );
  if (!confirmed) return;

  try {
    store.clearAll();
    showToast({ title: 'Все записи удалены', tone: 'var(--danger)' });
  } catch {
    showError('Не удалось очистить данные');
  }
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
