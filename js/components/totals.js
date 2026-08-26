import { CASHLESS_LABEL, METHODS } from '../methods.js';
import { formatMoney } from '../money.js';

/**
 * Блок итогов: плитки оплат, безнал, отдельная плитка трат и общая сумма
 * только по оплатам — траты в неё не входят.
 */
export function renderTotals(totals) {
  const methodTiles = METHODS.filter((method) => !method.expense)
    .map(
      (method) => `
      <div class="tile" style="--dot: ${method.color}">
        <div class="tile__label"><span class="tile__marker"></span>${method.short}</div>
        <div class="tile__value">${formatMoney(totals.byMethod[method.id] ?? 0)}</div>
      </div>`,
    )
    .join('');

  const spendTiles = METHODS.filter((method) => method.expense)
    .map(
      (method) => `
      <div class="tile tile--wide" style="--dot: ${method.color}">
        <div class="tile__label"><span class="tile__marker"></span>${method.short}</div>
        <div class="tile__value">${formatMoney(totals.byMethod[method.id] ?? 0)}</div>
        <div class="tile__note">Не входят в общую сумму оплат</div>
      </div>`,
    )
    .join('');

  const cashlessShare = totals.total > 0
    ? `${Math.round((totals.cashless / totals.total) * 100)}% от общей суммы`
    : 'нет оплат';

  return `
    <div class="totals">
      ${methodTiles}
      <div class="tile" style="--dot: var(--accent)">
        <div class="tile__label"><span class="tile__marker"></span>Безнал</div>
        <div class="tile__value">${formatMoney(totals.cashless)}</div>
        <div class="tile__note">${CASHLESS_LABEL} · ${cashlessShare}</div>
      </div>
      ${spendTiles}
      <div class="tile tile--wide tile--accent">
        <div class="tile__label">Всего по всем способам</div>
        <div class="tile__value">${formatMoney(totals.total)}</div>
        <div class="tile__note">${plural(totals.count)}${
          totals.count > 0 ? ` · средний чек ${formatMoney(Math.round(totals.total / totals.count))}` : ''
        }</div>
      </div>
    </div>`;
}

export function plural(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'оплат';
  if (mod10 === 1 && mod100 !== 11) word = 'оплата';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'оплаты';
  return `${count} ${word}`;
}
