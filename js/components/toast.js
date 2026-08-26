import { escapeHtml } from './dom.js';

const VISIBLE_MS = 2200;
const MAX_STACK = 2;

const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6.5"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.01"/></svg>';

let root = null;

export function initToasts() {
  root = document.getElementById('toast-root');
}

/**
 * @param {{title: string, subtitle?: string, tone?: string, icon?: string}} options
 *        tone — CSS-цвет акцента иконки, например `var(--qr)`.
 */
export function showToast({ title, subtitle = '', tone = 'var(--card)', icon = CHECK_ICON }) {
  if (!root) return;

  while (root.children.length >= MAX_STACK) root.firstElementChild.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.setProperty('--tone', tone);
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icon}</span>
    <span class="toast__text">
      <span>${escapeHtml(title)}</span>
      ${subtitle ? `<span class="toast__sub">${escapeHtml(subtitle)}</span>` : ''}
    </span>`;

  root.append(toast);

  setTimeout(() => {
    toast.classList.add('toast--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, VISIBLE_MS);
}

export function showError(title, subtitle = '') {
  showToast({ title, subtitle, tone: 'var(--danger)', icon: WARN_ICON });
}
