import { formatTime } from '../analytics.js';
import { METHODS, getMethod } from '../methods.js';
import { CURRENCY, formatMoney } from '../money.js';
import { escapeHtml } from './dom.js';

/**
 * Строка списка оплат. Один и тот же вид у «Статистики», где запись можно
 * править, и у «Истории», где список только для чтения.
 */
export function rowMarkup(payment, { editable = false } = {}) {
  const method = getMethod(payment.method);
  const body = `
    <span class="row__marker" aria-hidden="true"></span>
    <span class="row__body">
      <span class="row__title">${method.title}</span>
      <span class="row__time">🕒 ${formatTime(payment.createdAt)}</span>
    </span>
    <span class="row__amount">${formatMoney(payment.amount)}</span>`;

  if (!editable) {
    return `<div class="row" style="--dot: ${method.color}">${body}</div>`;
  }

  return `
    <div class="row" style="--dot: ${method.color}">
      <button class="row__main" type="button" data-edit="${payment.id}"
              aria-label="Изменить: ${method.title}, ${formatMoney(payment.amount)}">
        ${body}
      </button>
      <button class="row__delete" type="button" data-id="${payment.id}" aria-label="Удалить запись">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`;
}

/** Строка, раскрытая на правку: поле суммы, выбор способа и две кнопки. */
export function editorMarkup(editing, saving) {
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
