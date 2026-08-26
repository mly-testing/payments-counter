import * as api from './api.js';
import { isKnownMethod } from './methods.js';

/**
 * Состояние приложения. Данные не сохраняются на устройстве: единственное
 * место их жизни — Google Таблица, а здесь лежит только копия в памяти
 * на время работы вкладки.
 */
export const Status = {
  Idle: 'idle',
  Loading: 'loading',
  Ready: 'ready',
  Error: 'error',
};

/** @type {Array<{id: string, amount: number, method: string, createdAt: string}>} */
let payments = [];
let status = Status.Idle;
let lastError = null;
let pendingRefresh = null;

const listeners = new Set();

/* ==========================================================================
   Подписка
   ========================================================================== */

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/* ==========================================================================
   Чтение
   ========================================================================== */

/** Платежи от новых к старым. */
export function getPayments() {
  return payments;
}

export function getPayment(id) {
  return payments.find((item) => item.id === id) ?? null;
}

export function getCount() {
  return payments.length;
}

export function getStatus() {
  return status;
}

export function getError() {
  return lastError;
}

/* ==========================================================================
   Синхронизация с таблицей
   ========================================================================== */

/** Загружает всё заново. Повторные вызовы во время загрузки ждут тот же запрос. */
export function refresh() {
  if (pendingRefresh) return pendingRefresh;

  status = Status.Loading;
  lastError = null;
  notify();

  pendingRefresh = api
    .fetchPayments()
    .then((incoming) => {
      payments = sanitize(incoming);
      status = Status.Ready;
      lastError = null;
    })
    .catch((error) => {
      // Ранее загруженные записи оставляем на экране: показать устаревшие
      // данные с пометкой полезнее, чем обнулить экран.
      status = Status.Error;
      lastError = error;
      throw error;
    })
    .finally(() => {
      pendingRefresh = null;
      notify();
    });

  return pendingRefresh;
}

/* ==========================================================================
   Изменение
   ========================================================================== */

/** @returns созданный платёж — уже подтверждённый таблицей */
export async function addPayment(amount, method) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Сумма должна быть целым числом копеек больше нуля');
  }
  if (!isKnownMethod(method)) {
    throw new Error(`Неизвестный способ оплаты: ${method}`);
  }

  const created = await api.createPayment(amount, method);
  const [payment] = sanitize([created]);
  if (!payment) throw new api.ApiError('bad-response');

  payments = sanitize([payment, ...payments]);
  if (status === Status.Idle) status = Status.Ready;
  notify();
  return payment;
}

export async function removePayment(id) {
  await api.deletePayment(id);
  payments = payments.filter((item) => item.id !== id);
  notify();
}

/* ==========================================================================
   Проверка данных из таблицы
   ========================================================================== */

function sanitize(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        Number.isFinite(Number(item.amount)) &&
        Number(item.amount) > 0 &&
        isKnownMethod(item.method) &&
        !Number.isNaN(Date.parse(item.createdAt)),
    )
    .map((item) => ({
      id: item.id,
      amount: Math.round(Number(item.amount)),
      method: item.method,
      createdAt: new Date(item.createdAt).toISOString(),
    }))
    .sort(byNewestFirst);
}

function byNewestFirst(a, b) {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}
