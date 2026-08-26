import { describeError } from '../api.js';
import { daysWithPayments, formatDayLabel, formatTime, totalsOf } from '../analytics.js';
import { delegate, escapeHtml, haptic } from '../components/dom.js';
import { renderTotals } from '../components/totals.js';
import { showError, showToast } from '../components/toast.js';
import { SHEET_API } from '../config.js';
import { METHODS, getMethod } from '../methods.js';
import { CURRENCY, formatMoney, kopecksToInput, parseAmountInput } from '../money.js';
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
      Нажмите на запись, чтобы изменить сумму или способ оплаты. Все записи живут
      в Google Таблице: правки и удаления меняют её строки, а изменения, внесённые
      в таблице руками, появятся тут после обновления.
    </p>`;

  const totalsEl = container.querySelector('#history-totals');
  const listEl = container.querySelector('#history-list');

  /** Запись, открытая на правку, вместе с ещё не сохранёнными значениями. */
  let editing = null;
  let saving = false;
  let focusPending = false;

  function renderSummary() {
    totalsEl.innerHTML = `
      <div class="section__title">За всё время</div>
      ${renderTotals(totalsOf(store.getPayments()))}`;
  }

  function render() {
    renderSummary();

    // Запись могли удалить в таблице, пока она была открыта на правку.
    if (editing && !store.getPayment(editing.id)) editing = null;

    const payments = store.getPayments();
    if (payments.length > 0) {
      listEl.innerHTML = daysWithPayments(payments)
        .map((group) => dayGroupMarkup(group, rowOrEditor))
        .join('');
      if (focusPending) focusAmount();
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

  function rowOrEditor(payment) {
    return editing?.id === payment.id ? editorMarkup(editing, saving) : rowMarkup(payment);
  }

  function focusAmount() {
    focusPending = false;
    const input = listEl.querySelector('.edit__input');
    if (!input) return;

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function closeEditor() {
    editing = null;
    render();
  }

  async function commit() {
    if (!editing || saving) return;

    const payment = store.getPayment(editing.id);
    if (!payment) {
      closeEditor();
      return;
    }

    const amount = parseAmountInput(editing.draft);
    if (amount === null) {
      showError('Проверьте сумму', 'Нужно число больше нуля, например 1500 или 1500,50');
      return;
    }
    if (amount === payment.amount && editing.method === payment.method) {
      closeEditor();
      return;
    }

    saving = true;
    render();

    try {
      const updated = await store.updatePayment(editing.id, amount, editing.method);
      const method = getMethod(updated.method);
      editing = null;
      haptic(10);
      showToast({
        title: 'Запись изменена',
        subtitle: `${method.title} · ${formatMoney(updated.amount)}`,
        tone: method.color,
      });
    } catch (error) {
      // Введённые значения остаются на экране, чтобы можно было повторить.
      showError('Не удалось изменить', describeError(error));
    } finally {
      saving = false;
      render();
    }
  }

  delegate(container, '[data-edit]', 'click', (_event, button) => {
    if (saving) return;

    const payment = store.getPayment(button.dataset.edit);
    if (!payment) return;

    editing = {
      id: payment.id,
      draft: kopecksToInput(payment.amount),
      method: payment.method,
    };
    focusPending = true;
    render();
  });

  // Набранное запоминаем сразу: перерисовка не должна терять правку.
  container.addEventListener('input', (event) => {
    if (editing && event.target.classList.contains('edit__input')) {
      editing.draft = event.target.value;
    }
  });

  container.addEventListener('keydown', (event) => {
    if (!editing || !event.target.classList.contains('edit__input')) return;

    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') closeEditor();
    else return;

    event.preventDefault();
  });

  // Способ переключаем без перерисовки, иначе на телефоне закрылась бы клавиатура.
  delegate(container, '[data-pick]', 'click', (_event, button) => {
    if (!editing || saving) return;

    editing.method = button.dataset.pick;
    for (const chip of button.parentElement.children) {
      chip.setAttribute('aria-pressed', String(chip.dataset.pick === editing.method));
    }
  });

  delegate(container, '[data-action="edit-save"]', 'click', () => commit());

  delegate(container, '[data-action="edit-cancel"]', 'click', () => {
    if (!saving) closeEditor();
  });

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
    }
    render();
  });

  delegate(container, '[data-action="refresh"]', 'click', () => {
    store.refresh().catch(() => {
      // Полоса состояния под шапкой уже сообщила о проблеме.
    });
  });

  return {
    // Пока открыт редактор, список не пересобираем: фоновое обновление раз в
    // минуту иначе сбрасывало бы набранное и закрывало клавиатуру.
    update: () => (editing ? renderSummary() : render()),
    destroy() {},
  };
}

/* ==========================================================================
   Разметка
   ========================================================================== */

function dayGroupMarkup({ key, payments, totals }, renderRow) {
  return `
    <div class="list__group-title">
      <span class="list__group-day">${formatDayLabel(key)}</span>
      <span class="list__group-total">${formatMoney(totals.total)}</span>
    </div>
    <div class="card list">${payments.map(renderRow).join('')}</div>`;
}

function rowMarkup(payment) {
  const method = getMethod(payment.method);
  return `
    <div class="row" style="--dot: ${method.color}">
      <button class="row__main" type="button" data-edit="${payment.id}"
              aria-label="Изменить: ${method.title}, ${formatMoney(payment.amount)}">
        <span class="row__marker" aria-hidden="true"></span>
        <span class="row__body">
          <span class="row__title">${method.title}</span>
          <span class="row__time">🕒 ${formatTime(payment.createdAt)}</span>
        </span>
        <span class="row__amount">${formatMoney(payment.amount)}</span>
      </button>
      <button class="row__delete" type="button" data-id="${payment.id}" aria-label="Удалить запись">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`;
}

function editorMarkup(editing, saving) {
  const disabled = saving ? 'disabled' : '';

  return `
    <div class="row row--editing">
      <label class="edit__field">
        <input class="edit__input" type="text" inputmode="decimal" autocomplete="off"
               value="${escapeHtml(editing.draft)}" aria-label="Сумма" ${disabled}>
        <span class="edit__currency">${CURRENCY}</span>
      </label>

      <div class="edit__methods" role="group" aria-label="Способ оплаты">
        ${METHODS.map(
          (method) => `
          <button class="chip" type="button" data-pick="${method.id}"
                  style="--dot: ${method.color}"
                  aria-pressed="${method.id === editing.method}" ${disabled}>
            <span class="chip__dot" aria-hidden="true"></span>${method.short}
          </button>`,
        ).join('')}
      </div>

      <div class="edit__actions">
        <button class="btn" type="button" data-action="edit-cancel" ${disabled}>Отмена</button>
        <button class="btn btn--accent" type="button" data-action="edit-save" ${disabled}>
          ${saving ? '<span class="spinner"></span> Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>`;
}
