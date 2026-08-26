import { formatTime, toDayKey } from './analytics.js';
import { getMethod } from './methods.js';
import { formatMoney } from './money.js';

const APP_ID = 'payments-counter';

/**
 * CSV в формате, который понимает русская локаль Excel:
 * разделитель — точка с запятой, десятичный знак — запятая, в начале BOM.
 */
export function exportCsv(payments) {
  const header = ['Дата', 'Время', 'Способ оплаты', 'Тип', 'Сумма'];
  const rows = [...payments].reverse().map((payment) => {
    const method = getMethod(payment.method);
    const date = new Date(payment.createdAt);
    return [
      formatDate(date),
      formatTime(payment.createdAt),
      method.title,
      method.cashless ? 'Безналичная' : 'Наличные',
      formatMoney(payment.amount, { withCurrency: false }).replace(/\u00A0/g, ''),
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  download(`oplaty-${toDayKey(new Date())}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export function exportJson(payments) {
  const backup = {
    app: APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    payments,
  };
  download(
    `oplaty-backup-${toDayKey(new Date())}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  );
}

export async function importJson(file) {
  const parsed = JSON.parse(await file.text());
  const payments = Array.isArray(parsed) ? parsed : parsed?.payments;
  if (!Array.isArray(payments)) throw new Error('Неверный формат файла');
  return payments;
}

/* ==========================================================================
   Вспомогательное
   ========================================================================== */

function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}.${date.getFullYear()}`;
}

function csvCell(value) {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Освобождаем ссылку не сразу: Safari успевает начать скачивание.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
