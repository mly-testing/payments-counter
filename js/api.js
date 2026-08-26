import { SHEET_API } from './config.js';

/**
 * Общение с Apps Script.
 *
 * Запрос уходит как POST с типом text/plain: это «простой» запрос, для которого
 * браузер не делает предварительный OPTIONS. Apps Script на OPTIONS отвечать
 * не умеет, поэтому любой другой Content-Type сломал бы обращение из браузера.
 */
const TIMEOUT_MS = 20000;

export class ApiError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function call(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(SHEET_API.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token: SHEET_API.token }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(error.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new ApiError(`http-${response.status}`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('not-json');
  }

  if (!data || data.ok !== true) throw new ApiError(data?.error || 'unknown');
  return data;
}

export async function fetchPayments() {
  const data = await call({ action: 'list' });
  return Array.isArray(data.payments) ? data.payments : [];
}

export async function createPayment(amount, method) {
  const data = await call({ action: 'add', amount, method });
  if (!data.payment) throw new ApiError('empty-response');
  return data.payment;
}

export async function deletePayment(id) {
  await call({ action: 'delete', id });
}

/** Человеческое объяснение сбоя — его видит пользователь в уведомлении. */
export function describeError(error) {
  switch (error?.code) {
    // Браузер не даёт различить обрыв сети и отказ доступа: при закрытом
    // развёртывании ответ приходит без CORS-заголовков и fetch падает так же.
    case 'network':
      return 'Таблица недоступна: нет интернета либо скрипт опубликован не для всех';
    case 'timeout':
      return 'Таблица не ответила вовремя. Попробуйте снова';
    case 'unauthorized':
      return 'Ключ доступа не совпадает с тем, что в скрипте';
    case 'not-json':
      return 'Скрипт вернул не JSON. Проверьте, что развёрнута свежая версия';
    case 'unknown-action':
    case 'unknown-method':
      return 'Скрипт в таблице устарел, обновите развёртывание';
    case 'bad-amount':
      return 'Скрипт отклонил сумму';
    case 'http-401':
    case 'http-403':
      return 'Скрипт закрыт. При публикации выберите «Доступ: все»';
    case 'http-404':
      return 'Адрес скрипта не найден. Проверьте ссылку в config.js';
    default:
      return error?.code ? `Ошибка: ${error.code}` : 'Неизвестная ошибка';
  }
}
