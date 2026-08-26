import { escapeHtml } from './dom.js';

let root = null;
let active = null;

export function initConfirm() {
  root = document.getElementById('confirm-root');
}

/** Закрывает открытый диалог без подтверждения — например при уходе с экрана. */
export function closeConfirm() {
  active?.finish(false);
}

/**
 * Спрашивает подтверждение и возвращает true, только если нажали «Удалить».
 * Отмена, клик по фону и Escape дают false.
 */
export function showConfirm({ title, subtitle = '', confirmLabel = 'Удалить' }) {
  if (!root) return Promise.resolve(false);

  active?.finish(false);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm';
    overlay.innerHTML = `
      <div class="confirm__dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <p class="confirm__title" id="confirm-title">${escapeHtml(title)}</p>
        ${subtitle ? `<p class="confirm__sub">${escapeHtml(subtitle)}</p>` : ''}
        <div class="confirm__actions">
          <button class="btn" type="button" data-answer="no">Отмена</button>
          <button class="btn btn--danger" type="button" data-answer="yes">
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>`;

    const finish = (value) => {
      if (active?.overlay !== overlay) return;
      active = null;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish(false);
    };

    overlay.addEventListener('click', (event) => {
      const answer = event.target.closest('[data-answer]')?.dataset.answer;
      if (answer === 'yes') finish(true);
      else if (answer === 'no' || event.target === overlay) finish(false);
    });

    document.addEventListener('keydown', onKey);
    root.replaceChildren(overlay);
    active = { overlay, finish };
    overlay.querySelector('[data-answer="no"]').focus();
  });
}
