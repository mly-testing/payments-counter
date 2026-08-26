import { formatTime } from '../analytics.js';
import { METHODS, getMethod } from '../methods.js';
import { CURRENCY, formatMoney } from '../money.js';
import { escapeHtml } from './dom.js';

/**
 * Строка списка оплат. Один и тот же вид у «Статистики», где запись можно
 * править, и у «Истории», где список только для чтения.
 */
export function rowMarkup(payment, { editable = false, active = false } = {}) {
  const method = getMethod(payment.method);
  const activeClass = active ? ' row--active' : '';
  const body = `
    <span class="row__marker" aria-hidden="true"></span>
    <span class="row__body">
      <span class="row__title">${method.title}</span>
      <span class="row__time">🕒 ${formatTime(payment.createdAt)}</span>
    </span>
    <span class="row__amount">${formatMoney(payment.amount)}</span>`;

  if (!editable) {
    return `<div class="row${activeClass}" style="--dot: ${method.color}">${body}</div>`;
  }

  return `
    <div class="row${activeClass}" style="--dot: ${method.color}">
      <button class="row__main" type="button" data-edit="${payment.id}"
              aria-label="Изменить: ${method.title}, ${formatMoney(payment.amount)}">
        ${body}
      </button>
      <button class="row__delete" type="button" data-id="${payment.id}" aria-label="Удалить запись">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`;
}

/** Карточка правки: сумма, способ оплаты и кнопки. Живёт в оверлее, не в списке. */
export function editorMarkup(editing, saving, payment) {
  const disabled = saving ? 'disabled' : '';
  const method = getMethod(payment?.method ?? editing.method);
  const caption = payment
    ? `${method.title} · ${formatTime(payment.createdAt)}`
    : method.title;

  return `
    <div class="editor-sheet">
      <p class="editor-sheet__title" id="editor-title">Изменить запись</p>
      <p class="editor-sheet__sub">${escapeHtml(caption)}</p>

      <label class="edit__field">
        <input class="edit__input" type="text" inputmode="decimal" autocomplete="off"
               value="${escapeHtml(editing.draft)}" aria-label="Сумма" ${disabled}>
        <span class="edit__currency">${CURRENCY}</span>
      </label>

      <div class="edit__methods" role="group" aria-label="Способ оплаты">
        ${METHODS.map(
          (item) => `
          <button class="chip" type="button" data-pick="${item.id}"
                  style="--dot: ${item.color}"
                  aria-pressed="${item.id === editing.method}" ${disabled}>
            <span class="chip__dot" aria-hidden="true"></span>${item.short}
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
