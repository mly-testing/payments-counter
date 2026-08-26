import { describeError } from '../api.js';
import { formatDayLabel, formatTime, paymentsOfDay, todayKey, totalsOf } from '../analytics.js';
import { showConfirm, closeConfirm } from '../components/confirm.js';
import { delegate, haptic, pinToVisualViewport } from '../components/dom.js';
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

  // Панель живёт на body: внутри колонки приложения Safari иногда считает
  // position:fixed не от экрана, и кнопки снова оказываются под клавиатурой.
  const overlayEl = document.createElement('div');
  overlayEl.className = 'editor-overlay';
  overlayEl.hidden = true;
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-labelledby', 'editor-title');
  document.body.append(overlayEl);

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
    } else {
      listEl.innerHTML = `<div class="card list">${payments
        .map((payment) =>
          rowMarkup(payment, { editable: true, active: editing?.id === payment.id }),
        )
        .join('')}</div>`;
    }

    renderEditor();
  }

  function renderEditor() {
    document.body.classList.toggle('is-editing', Boolean(editing));

    if (!editing) {
      overlayEl.hidden = true;
      overlayEl.innerHTML = '';
      return;
    }

    overlayEl.hidden = false;
    overlayEl.innerHTML = editorMarkup(editing, saving, store.getPayment(editing.id));
    pinToVisualViewport(overlayEl);
    if (focusPending) focusAmount();
  }

  function focusAmount() {
    focusPending = false;
    const input = overlayEl.querySelector('.edit__input');
    if (!input) return;

    // Safari по фокусу крутит страницу к полю и снова прячет кнопки.
    // Редактор уже в видимой области — прокрутку глушим.
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    pinToVisualViewport(overlayEl);
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

  // Слушатели на панели: она не внутри container, делегирование списка её не видит.
  overlayEl.addEventListener('input', (event) => {
    if (editing && event.target.classList.contains('edit__input')) {
      editing.draft = event.target.value;
    }
  });

  overlayEl.addEventListener('keydown', (event) => {
    if (!editing || !event.target.classList.contains('edit__input')) return;

    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') closeEditor();
    else return;

    event.preventDefault();
  });

  delegate(overlayEl, '[data-pick]', 'click', (_event, button) => {
    if (!editing || saving) return;

    editing.method = button.dataset.pick;
    for (const chip of button.parentElement.children) {
      chip.setAttribute('aria-pressed', String(chip.dataset.pick === editing.method));
    }
  });

  delegate(overlayEl, '[data-action="edit-save"]', 'click', () => commit());

  delegate(overlayEl, '[data-action="edit-cancel"]', 'click', () => {
    if (!saving) closeEditor();
  });

  overlayEl.addEventListener('click', (event) => {
    if (event.target === overlayEl && !saving) closeEditor();
  });

  delegate(container, '.row__delete', 'click', async (_event, button) => {
    const { id } = button.dataset;
    const payment = store.getPayment(id);
    if (!payment || button.disabled) return;

    const method = getMethod(payment.method);
    const confirmed = await showConfirm({
      title: 'Удалить запись?',
      subtitle: `${method.title} · ${formatMoney(payment.amount)} · ${formatTime(payment.createdAt)}`,
    });
    if (!confirmed || !store.getPayment(id)) return;

    const current = listEl.querySelector(`.row__delete[data-id="${id}"]`);
    if (current) {
      current.disabled = true;
      current.innerHTML = '<span class="spinner"></span>';
    }

    try {
      await store.removePayment(id);
      haptic(12);
      showToast({
        title: 'Запись удалена',
        subtitle: `${method.title} · ${formatMoney(payment.amount)}`,
        tone: 'var(--danger)',
      });
    } catch (error) {
      showError('Не удалось удалить', describeError(error));
    }
    render();
  });

  const viewport = window.visualViewport;
  const onViewportChange = () => {
    if (editing) pinToVisualViewport(overlayEl);
  };
  viewport?.addEventListener('resize', onViewportChange);
  viewport?.addEventListener('scroll', onViewportChange);
  window.addEventListener('resize', onViewportChange);

  return {
    // Пока открыт редактор, список не пересобираем: фоновое обновление раз в
    // минуту иначе сбрасывало бы набранное и закрывало клавиатуру.
    update: () => (editing ? renderSummary() : render()),
    destroy() {
      viewport?.removeEventListener('resize', onViewportChange);
      viewport?.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      document.body.classList.remove('is-editing');
      overlayEl.remove();
      closeConfirm();
    },
  };
}
