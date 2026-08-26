import { isKnownMethod } from './methods.js';

/**
 * Единственный источник правды. Всё лежит в localStorage телефона —
 * ни один платёж не уходит в сеть.
 */
const STORAGE_KEY = 'payments-counter.v1';

/** @type {Array<{id: string, amount: number, method: string, createdAt: string}>} */
let payments = [];
let storageAvailable = true;

const listeners = new Set();

/* ==========================================================================
   Загрузка и сохранение
   ========================================================================== */

function sanitize(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        Number.isInteger(item.amount) &&
        item.amount > 0 &&
        isKnownMethod(item.method) &&
        !Number.isNaN(Date.parse(item.createdAt)),
    )
    .map((item) => ({
      id: item.id,
      amount: item.amount,
      method: item.method,
      createdAt: new Date(item.createdAt).toISOString(),
    }))
    .sort(byNewestFirst);
}

function byNewestFirst(a, b) {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitize(parsed?.payments ?? parsed);
  } catch (error) {
    console.warn('Не удалось прочитать сохранённые данные:', error);
    return [];
  }
}

function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, payments }));
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
    console.error('Не удалось сохранить данные:', error);
    throw new Error('storage-failed');
  }
}

export function init() {
  payments = read();

  // Приложение может быть открыто в двух вкладках — держим их синхронными.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    payments = read();
    notify();
  });
}

export function isStorageAvailable() {
  return storageAvailable;
}

/* ==========================================================================
   Подписка
   ========================================================================== */

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener(payments);
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

/* ==========================================================================
   Изменение
   ========================================================================== */

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @returns созданный платёж */
export function addPayment(amount, method) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Сумма должна быть целым числом копеек больше нуля');
  }
  if (!isKnownMethod(method)) {
    throw new Error(`Неизвестный способ оплаты: ${method}`);
  }

  const payment = {
    id: newId(),
    amount,
    method,
    createdAt: new Date().toISOString(),
  };

  const previous = payments;
  payments = [payment, ...payments];
  try {
    write();
  } catch (error) {
    payments = previous;
    throw error;
  }
  notify();
  return payment;
}

export function removePayment(id) {
  const previous = payments;
  const next = payments.filter((item) => item.id !== id);
  if (next.length === previous.length) return false;

  payments = next;
  try {
    write();
  } catch (error) {
    payments = previous;
    throw error;
  }
  notify();
  return true;
}

export function clearAll() {
  const previous = payments;
  payments = [];
  try {
    write();
  } catch (error) {
    payments = previous;
    throw error;
  }
  notify();
}

/** Восстановление из резервной копии: заменяет весь набор данных. */
export function replaceAll(raw) {
  const previous = payments;
  payments = sanitize(raw);
  try {
    write();
  } catch (error) {
    payments = previous;
    throw error;
  }
  notify();
  return payments.length;
}
