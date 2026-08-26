import { describeError } from '../api.js';
import { formatDayLabel, paymentsOfDay, todayKey, totalsOf } from '../analytics.js';
import { delegate, haptic } from '../components/dom.js';
import { editorMarkup, rowMarkup } from '../components/payment-rows.js';
import { plural, renderTotals } from '../components/totals.js';
import { showError, showToast } from '../components/toast.js';
import { getMethod } from '../methods.js';
import { formatMoney, kopecksToInput, parseAmountInput } from '../money.js';
import * as store from '../store.js';

export const title = 'Статистика';

export function subtitle() {
  const count = todayPayments().length;
  return count === 0 ? 'Сегодня оплат ещё не было' : `Сегодня: ${plural(count)}`;
}

function todayPayments() {
  return paymentsOfDay(store.getPayments(), todayKey());
}

export function mount(container) {
  container.innerHTML = `
    <div class="section" id="day-totals"></div>
    <div class="section">
      <div class="section__title">Операции этого дня</div>
      <div id="day-list"></div>
    </div>`;

  const totalsEl = container.querySelector('#day-totals');
  const listEl = container.querySelector('#day-list');

  /** Запись, открытая на правку, вместе с ещё не сохранёнными значениями. */
  let editing = null;
  let saving = false;
  let focusPending = false;

  function renderSummary() {
    totalsEl.innerHTML = `
      <div class="section__title">${formatDayLabel(todayKey())}</div>
      ${renderTotals(totalsOf(todayPayments()))}`;
  }

  function render() {
    renderSummary();

    // Запись могли удалить в таблице, пока она была открыта на правку.
    if (editing && !store.getPayment(editing.id)) editing = null;

    const payments = todayPayments();
    if (payments.length === 0) {
      listEl.innerHTML =
        store.getStatus() === store.Status.Loading
          ? '<div class="card empty"><span class="spinner spinner--lg"></span>Читаю таблицу…</div>'
          : `<div class="card empty">
               <span class="empty__emoji">📭</span>
               Сегодня оплат ещё не было
             </div>`;
      return;
    }

    listEl.innerHTML = `<div class="card list">${payments.map(rowOrEditor).join('')}</div>`;
    if (focusPending) focusAmount();
  }

  function rowOrEditor(payment) {
    return editing?.id === payment.id
      ? editorMarkup(editing, saving)
      : rowMarkup(payment, { editable: true });
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

  return {
    // Пока открыт редактор, список не пересобираем: фоновое обновление раз в
    // минуту иначе сбрасывало бы набранное и закрывало клавиатуру.
    update: () => (editing ? renderSummary() : render()),
    destroy() {},
  };
}
