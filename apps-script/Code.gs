/**
 * Бэкенд приложения «Оплаты» на Google Apps Script.
 *
 * Скрипт живёт внутри самой таблицы (Расширения → Apps Script) и публикуется
 * как веб-приложение. Приложение в браузере обращается к нему по HTTP,
 * поэтому входить в Google на телефоне не нужно.
 *
 * Установка описана в README проекта. Коротко:
 *   1. Замените TOKEN на свой секрет.
 *   2. Запустите функцию setup один раз — она создаст лист и запросит доступ.
 *   3. Развёртывание → Новое развёртывание → Веб-приложение,
 *      «Запуск от имени: я», «Доступ: все».
 *   4. Скопируйте адрес вида .../exec в js/config.js приложения.
 */

/** Тот же секрет должен стоять в js/config.js. Придумайте длинную случайную строку. */
const TOKEN = 'ЗАМЕНИТЕ_НА_СВОЙ_СЕКРЕТ';

const SHEET_NAME = 'Оплаты';

const HEADERS = [
  'ID',
  'Дата',
  'Время',
  'Способ оплаты',
  'Код',
  'Тип',
  'Сумма',
  'Метка времени',
];

const COL = { ID: 0, DATE: 1, TIME: 2, TITLE: 3, CODE: 4, KIND: 5, AMOUNT: 6, STAMP: 7 };

const METHODS = {
  qr: { title: 'Безнал — QR', cashless: true },
  card: { title: 'Безнал — Картой', cashless: true },
  cash: { title: 'Наличными', cashless: false },
};

const LOCK_TIMEOUT_MS = 10000;

/* ==========================================================================
   Точки входа
   ========================================================================== */

function doGet(e) {
  return respond(handle(e ? e.parameter : null));
}

function doPost(e) {
  var request = null;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (error) {
    request = e ? e.parameter : null;
  }
  return respond(handle(request));
}

function handle(request) {
  if (!request || String(request.token) !== TOKEN) {
    return { ok: false, error: 'unauthorized' };
  }

  try {
    switch (request.action) {
      case 'list':
        return { ok: true, payments: readPayments() };
      case 'add':
        return { ok: true, payment: appendPayment(request) };
      case 'delete':
        return { ok: true, deleted: deletePayment(String(request.id || '')) };
      default:
        return { ok: false, error: 'unknown-action' };
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/* ==========================================================================
   Чтение
   ========================================================================== */

function readPayments() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
  const rows = range.getValues();
  const timezone = getTimezone();

  const payments = [];
  var dirty = false;

  for (var i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const code = normalizeCode(row);
    const amount = toKopecks(row[COL.AMOUNT]);
    const stamp = resolveStamp(row, timezone);

    // Строку, добавленную руками, дополняем сами: так таблицей можно
    // пользоваться напрямую, не заполняя служебные колонки.
    if (!code || amount === null || !stamp) continue;
    if (fillDerived(row, code, amount, stamp, timezone)) dirty = true;

    payments.push({
      id: row[COL.ID],
      method: code,
      amount: amount,
      createdAt: stamp.toISOString(),
    });
  }

  if (dirty) range.setValues(rows);

  payments.sort(function (a, b) {
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
  return payments;
}

/** Код способа берём из служебной колонки, а если её нет — по названию. */
function normalizeCode(row) {
  const raw = String(row[COL.CODE] || '').trim().toLowerCase();
  if (METHODS[raw]) return raw;

  const title = String(row[COL.TITLE] || '').trim().toLowerCase();
  for (var code in METHODS) {
    if (METHODS[code].title.toLowerCase() === title) return code;
  }
  return null;
}

/** Метка времени, а при её отсутствии — дата и время из читаемых колонок. */
function resolveStamp(row, timezone) {
  const stamp = row[COL.STAMP];
  if (stamp instanceof Date && !isNaN(stamp.getTime())) return stamp;

  if (stamp) {
    const parsed = new Date(String(stamp));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const date = String(row[COL.DATE] || '').trim();
  const time = String(row[COL.TIME] || '').trim();
  const dateParts = date.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!dateParts) {
    if (row[COL.DATE] instanceof Date) return row[COL.DATE];
    return null;
  }

  const timeParts = time.match(/^(\d{1,2}):(\d{2})/) || ['', '12', '00'];
  const iso = Utilities.formatString(
    '%s-%s-%sT%s:%s:00',
    dateParts[3],
    pad(dateParts[2]),
    pad(dateParts[1]),
    pad(timeParts[1]),
    pad(timeParts[2]),
  );
  const local = new Date(iso + timezoneOffset(timezone, iso));
  return isNaN(local.getTime()) ? null : local;
}

/** @returns true, если строку пришлось дополнить и её надо записать обратно. */
function fillDerived(row, code, amount, stamp, timezone) {
  var changed = false;

  if (!String(row[COL.ID] || '').trim()) {
    row[COL.ID] = Utilities.getUuid();
    changed = true;
  }
  if (String(row[COL.CODE] || '').trim().toLowerCase() !== code) {
    row[COL.CODE] = code;
    changed = true;
  }
  if (String(row[COL.TITLE] || '').trim() !== METHODS[code].title) {
    row[COL.TITLE] = METHODS[code].title;
    changed = true;
  }

  const kind = METHODS[code].cashless ? 'Безналичная' : 'Наличные';
  if (String(row[COL.KIND] || '').trim() !== kind) {
    row[COL.KIND] = kind;
    changed = true;
  }

  const date = Utilities.formatDate(stamp, timezone, 'dd.MM.yyyy');
  const time = Utilities.formatDate(stamp, timezone, 'HH:mm');
  if (String(row[COL.DATE] || '').trim() !== date) {
    row[COL.DATE] = date;
    changed = true;
  }
  if (String(row[COL.TIME] || '').trim() !== time) {
    row[COL.TIME] = time;
    changed = true;
  }

  const iso = stamp.toISOString();
  if (String(row[COL.STAMP] || '') !== iso) {
    row[COL.STAMP] = iso;
    changed = true;
  }
  if (row[COL.AMOUNT] !== amount / 100) {
    row[COL.AMOUNT] = amount / 100;
    changed = true;
  }

  return changed;
}

/* ==========================================================================
   Запись
   ========================================================================== */

function appendPayment(request) {
  const method = String(request.method || '').trim().toLowerCase();
  if (!METHODS[method]) throw new Error('unknown-method');

  const amount = Math.round(Number(request.amount));
  if (!isFinite(amount) || amount <= 0) throw new Error('bad-amount');

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const sheet = getSheet();
    const timezone = getTimezone();
    const now = new Date();
    const id = Utilities.getUuid();

    sheet.appendRow([
      id,
      Utilities.formatDate(now, timezone, 'dd.MM.yyyy'),
      Utilities.formatDate(now, timezone, 'HH:mm'),
      METHODS[method].title,
      method,
      METHODS[method].cashless ? 'Безналичная' : 'Наличные',
      amount / 100,
      now.toISOString(),
    ]);

    return { id: id, method: method, amount: amount, createdAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/** @returns true, если строка нашлась и была удалена. */
function deletePayment(id) {
  if (!id) return false;

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i += 1) {
      if (String(ids[i][0]).trim() === id) {
        sheet.deleteRow(i + 2);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   Лист
   ========================================================================== */

/** Запустите один раз из редактора: создаст лист и запросит нужные разрешения. */
function setup() {
  const sheet = getSheet();
  Logger.log('Лист «%s» готов. Строк с данными: %s', SHEET_NAME, Math.max(sheet.getLastRow() - 1, 0));
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findSheet(book);
  if (!sheet) sheet = book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) initSheet(sheet);
  return sheet;
}

/**
 * Ищем лист сначала по точному имени, затем без учёта регистра и крайних
 * пробелов. Google считает такие названия дубликатами и не даёт создать
 * второй лист, а getSheetByName при этом их не находит.
 */
function findSheet(book) {
  const exact = book.getSheetByName(SHEET_NAME);
  if (exact) return exact;

  const wanted = SHEET_NAME.trim().toLowerCase();
  const sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i += 1) {
    if (sheets[i].getName().trim().toLowerCase() === wanted) return sheets[i];
  }
  return null;
}

function initSheet(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Служебные колонки держим текстом, иначе Google превратит их в даты и числа.
  sheet.getRange('A:F').setNumberFormat('@');
  sheet.getRange('G:G').setNumberFormat('#,##0.00');
  sheet.getRange('H:H').setNumberFormat('@');

  const widths = [280, 90, 70, 150, 60, 110, 100, 190];
  for (var i = 0; i < widths.length; i += 1) sheet.setColumnWidth(i + 1, widths[i]);
}

function getTimezone() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

/* ==========================================================================
   Вспомогательное
   ========================================================================== */

function toKopecks(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(number) || number <= 0) return null;
  return Math.round(number * 100);
}

function pad(value) {
  return String(value).length < 2 ? '0' + value : String(value);
}

/** Смещение вида «+03:00» для указанной локальной даты. */
function timezoneOffset(timezone, isoLocal) {
  const probe = new Date(isoLocal + 'Z');
  const formatted = Utilities.formatDate(probe, timezone, 'XXX');
  return formatted === 'Z' ? '+00:00' : formatted;
}
