import { formatTime, todayKey, paymentsOfDay, totalsOf } from '../analytics.js';
import { delegate, haptic } from '../components/dom.js';
import { showError, showToast } from '../components/toast.js';
import { METHODS, getMethod } from '../methods.js';
import {
  CURRENCY,
  EMPTY_DRAFT,
  draftToKopecks,
  formatDraft,
  formatMoney,
  popDigit,
  pushDigit,
  pushSeparator,
} from '../money.js';
import * as store from '../store.js';

/** Черновик суммы живёт вне view, чтобы не пропадать при переходе на другую вкладку. */
let draft = EMPTY_DRAFT;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'sep', '0', 'back'];
const LONG_PRESS_MS = 550;

export const title = 'Ввод';

export function subtitle() {
  const totals = totalsOf(paymentsOfDay(store.getPayments(), todayKey()));
  return totals.count === 0
    ? 'Сегодня оплат ещё не было'
    : `Сегодня: ${formatMoney(totals.total)} · безнал ${formatMoney(totals.cashless)}`;
}

export function mount(container) {
  container.innerHTML = `
    <div class="amount">
      <span class="amount__value" id="amount-value" aria-live="polite">0</span>
      <span class="amount__currency">${CURRENCY}</span>
    </div>
    <p class="amount__hint" id="amount-hint"></p>
    <div class="keypad" id="keypad">${KEYS.map(keyMarkup).join('')}</div>
    <div class="methods" id="methods"></div>`;

  const valueEl = container.querySelector('#amount-value');
  const hintEl = container.querySelector('#amount-hint');
  const methodsEl = container.querySelector('#methods');

  let longPressTimer = null;
  let longPressFired = false;

  function render() {
    const empty = draft === EMPTY_DRAFT;
    valueEl.textContent = formatDraft(draft);
    valueEl.classList.toggle('amount__value--empty', empty);
    hintEl.textContent = empty
      ? 'Введите сумму оплаты'
      : 'Теперь выберите способ оплаты — запись сохранится сразу';
    methodsEl.innerHTML = methodsMarkup(empty);
  }

  function setDraft(next) {
    if (next === draft) return;
    draft = next;
    render();
  }

  function save(methodId) {
    const amount = draftToKopecks(draft);
    if (amount <= 0) {
      showError('Сначала введите сумму');
      return;
    }

    let payment;
    try {
      payment = store.addPayment(amount, methodId);
    } catch {
      showError('Не удалось сохранить', 'Браузер запретил локальное хранилище');
      return;
    }

    const method = getMethod(methodId);
    draft = EMPTY_DRAFT;
    render();
    haptic([10, 40, 14]);
    showToast({
      title: 'Сохранено',
      subtitle: `${method.title} · ${formatMoney(payment.amount)} · ${formatTime(payment.createdAt)}`,
      tone: method.color,
    });
  }

  delegate(container, '.key', 'click', (_event, button) => {
    const key = button.dataset.key;

    if (key === 'back') {
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      setDraft(popDigit(draft));
    } else if (key === 'sep') {
      setDraft(pushSeparator(draft));
    } else {
      setDraft(pushDigit(draft, key));
    }
    haptic(6);
  });

  // Долгое нажатие на «стереть» очищает всю сумму.
  delegate(container, '.key[data-key="back"]', 'pointerdown', () => {
    longPressFired = false;
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      setDraft(EMPTY_DRAFT);
      haptic(18);
    }, LONG_PRESS_MS);
  });

  const cancelLongPress = () => clearTimeout(longPressTimer);
  container.addEventListener('pointerup', cancelLongPress);
  container.addEventListener('pointercancel', cancelLongPress);
  container.addEventListener('pointerleave', cancelLongPress);

  delegate(container, '.method', 'click', (_event, button) => save(button.dataset.method));

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (/^[0-9]$/.test(event.key)) setDraft(pushDigit(draft, event.key));
    else if (event.key === ',' || event.key === '.') setDraft(pushSeparator(draft));
    else if (event.key === 'Backspace') setDraft(popDigit(draft));
    else if (event.key === 'Escape') setDraft(EMPTY_DRAFT);
    else return;

    event.preventDefault();
  }
  window.addEventListener('keydown', onKeyDown);

  return {
    update: render,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      cancelLongPress();
    },
  };
}

/* ==========================================================================
   Разметка
   ========================================================================== */

function keyMarkup(key) {
  if (key === 'sep') {
    return '<button class="key key--util" type="button" data-key="sep" aria-label="Запятая">,</button>';
  }
  if (key === 'back') {
    return '<button class="key key--util" type="button" data-key="back" aria-label="Стереть цифру">⌫</button>';
  }
  return `<button class="key" type="button" data-key="${key}">${key}</button>`;
}

function methodsMarkup(disabled) {
  const todayTotals = totalsOf(paymentsOfDay(store.getPayments(), todayKey()));

  return METHODS.map((method) => {
    const amount = todayTotals.byMethod[method.id] ?? 0;
    return `
      <button class="method" type="button" data-method="${method.id}"
              style="--dot: ${method.color}" ${disabled ? 'disabled' : ''}>
        <span class="method__dot" aria-hidden="true">
          <svg viewBox="0 0 24 24">${method.icon}</svg>
        </span>
        <span class="method__body">
          <span class="method__title">${method.title}</span>
          <span class="method__meta">сегодня ${formatMoney(amount)}</span>
        </span>
        <span class="method__chevron" aria-hidden="true">›</span>
      </button>`;
  }).join('');
}
