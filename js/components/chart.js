import { formatDayShort } from '../analytics.js';
import { METHODS } from '../methods.js';
import { formatCompact } from '../money.js';

/**
 * Столбчатый график с накоплением: один столбец — один день,
 * слои внутри столбца — способы оплаты, подпись сверху — итог дня.
 * Рисуется вручную на SVG, чтобы приложение осталось без зависимостей.
 */

const VIEW_W = 340;
const VIEW_H = 200;
const PAD = { top: 20, right: 8, bottom: 24, left: 32 };

const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const BASELINE = PAD.top + PLOT_H;

const MAX_BAR_W = 26;
const TOTAL_LABEL_LIMIT = 10; // при большем числе дней подписи итогов сливаются

let clipSeq = 0;

export function renderChart(series, { activeKey = null } = {}) {
  const maxTotal = Math.max(0, ...series.map((day) => day.total));
  if (maxTotal === 0) return renderEmptyChart();

  const scaleMax = niceCeil(maxTotal);
  const band = PLOT_W / series.length;
  const barW = Math.max(4, Math.min(band * 0.62, MAX_BAR_W));
  const labelStep = Math.ceil(series.length / 9);
  const showTotals = series.length <= TOTAL_LABEL_LIMIT;
  const labelIndices = pickLabelIndices(series, labelStep, activeKey);

  const parts = [gridMarkup(scaleMax)];

  series.forEach((day, index) => {
    const centerX = PAD.left + band * (index + 0.5);
    const isActive = day.key === activeKey;

    // Зоны нажатия делят ширину графика без наложений, иначе выбирался бы
    // сосед. Пустые дни тоже кликабельны — их детали пользователю тоже нужны.
    const hit = `<rect class="chart__hit${isActive ? ' chart__hit--active' : ''}" data-day="${day.key}"
          x="${round(centerX - band / 2)}" y="${PAD.top}" width="${round(band)}" height="${round(PLOT_H)}"/>`;

    if (day.total === 0) {
      parts.push(hit);
    } else {
      const { clip, stack } = barLayers(day, centerX, barW, scaleMax);
      parts.push(clip, hit, stack);

      if (showTotals) {
        parts.push(
          `<text class="chart__total" x="${round(centerX)}" y="${round(toY(day.total, scaleMax) - 6)}">${formatCompact(day.total)}</text>`,
        );
      }
    }

    if (labelIndices.has(index)) {
      parts.push(
        `<text class="chart__x-label${isActive ? ' chart__x-label--active' : ''}" x="${round(centerX)}" y="${VIEW_H - 6}">${formatDayShort(day.key)}</text>`,
      );
    }
  });

  return svgWrapper(parts.join(''));
}

/**
 * Подписи оси через равные промежутки плюс обязательная подпись выбранного дня.
 * Соседние с выбранным подписи убираются — иначе они наезжают друг на друга.
 */
function pickLabelIndices(series, labelStep, activeKey) {
  const indices = new Set();
  for (let i = 0; i < series.length; i += labelStep) indices.add(i);

  const activeIndex = series.findIndex((day) => day.key === activeKey);
  if (activeIndex >= 0) {
    for (const index of [...indices]) {
      if (Math.abs(index - activeIndex) < labelStep) indices.delete(index);
    }
    indices.add(activeIndex);
  }
  return indices;
}

/** Столбец режется на слои по способам оплаты и скругляется общей маской. */
function barLayers(day, centerX, barW, scaleMax) {
  const clipId = `bar-clip-${(clipSeq += 1)}`;
  const x = centerX - barW / 2;
  const topY = toY(day.total, scaleMax);

  let cursor = BASELINE;
  const segments = METHODS.map((method) => {
    const amount = day.byMethod[method.id] ?? 0;
    if (amount === 0) return '';
    const segmentH = (amount / scaleMax) * PLOT_H;
    cursor -= segmentH;
    return `<rect x="${round(x)}" y="${round(cursor)}" width="${round(barW)}" height="${round(segmentH)}" fill="${method.color}"/>`;
  }).join('');

  return {
    clip: `<clipPath id="${clipId}">
      <rect x="${round(x)}" y="${round(topY)}" width="${round(barW)}" height="${round(BASELINE - topY)}" rx="4"/>
    </clipPath>`,
    stack: `<g class="chart__stack" clip-path="url(#${clipId})">${segments}</g>`,
  };
}

function gridMarkup(scaleMax) {
  return [0, 0.5, 1]
    .map((ratio) => {
      const value = scaleMax * ratio;
      const y = toY(value, scaleMax);
      return `
        <line class="chart__grid-line" x1="${PAD.left}" y1="${round(y)}" x2="${VIEW_W - PAD.right}" y2="${round(y)}"/>
        <text class="chart__grid-label" x="${PAD.left - 6}" y="${round(y + 3)}" text-anchor="end">${formatCompact(value)}</text>`;
    })
    .join('');
}

function renderEmptyChart() {
  return svgWrapper(`
    <line class="chart__grid-line" x1="${PAD.left}" y1="${BASELINE}" x2="${VIEW_W - PAD.right}" y2="${BASELINE}"/>
    <text class="chart__x-label" x="${VIEW_W / 2}" y="${PAD.top + PLOT_H / 2}">Нет оплат за этот период</text>`);
}

function svgWrapper(body) {
  return `<svg class="chart" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img"
               aria-label="Суммы оплат по дням" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function renderLegend() {
  const items = METHODS.map(
    (method) => `
      <span class="legend__item">
        <span class="legend__marker" style="--dot: ${method.color}"></span>${method.short}
      </span>`,
  ).join('');
  return `<div class="legend">${items}</div>`;
}

/* ==========================================================================
   Вспомогательное
   ========================================================================== */

function toY(value, scaleMax) {
  return BASELINE - (value / scaleMax) * PLOT_H;
}

/** Округляет верх шкалы вверх до «круглого» числа, чтобы подписи сетки читались. */
function niceCeil(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
