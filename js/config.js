/**
 * Подключение к Google Таблице.
 *
 * Заполните оба поля после публикации скрипта из папки apps-script.
 * Пошаговая инструкция — в README проекта.
 */
export const SHEET_API = {
  /** Адрес веб-приложения Apps Script, оканчивается на /exec */
  url: 'https://script.google.com/macros/s/AKfycbwp6vIzNSSwb5y_iztK_gZl87MkCeCIAgniNGNONZmR4kvU4a7pCcdVEuHOtUHoVwn2jg/exec',

  /** Тот же секрет, что стоит в константе TOKEN внутри Code.gs */
  token: '_H_WPiDKrHtaUj68V4Ae8lV6n2VT0F5VoIyPF1_JXuo',

  /** Ссылка на саму таблицу — для кнопки «Открыть таблицу». Необязательно. */
  sheetUrl: 'https://docs.google.com/spreadsheets/d/11I2sgPrHrQW_P7q2eE8tbYAI6Bc7ATCbUqZ-62xwjfM/edit?gid=2057802836',
};

export function isConfigured() {
  return Boolean(SHEET_API.url && SHEET_API.token);
}
