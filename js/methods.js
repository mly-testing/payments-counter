/**
 * Способы оплаты. Порядок в массиве определяет порядок во всём интерфейсе:
 * кнопки ввода, плитки итогов, слои в столбцах графика.
 */
export const METHODS = [
  {
    id: 'qr',
    title: 'Безнал — QR',
    short: 'QR',
    color: 'var(--qr)',
    cashless: true,
    icon: `<rect x="3" y="3" width="7" height="7" rx="1.6"/>
           <rect x="14" y="3" width="7" height="7" rx="1.6"/>
           <rect x="3" y="14" width="7" height="7" rx="1.6"/>
           <path d="M14 14h3.5v3.5H14zM20.5 14v.01M14 20.5v.01M20.5 20.5v.01"/>`,
  },
  {
    id: 'card',
    title: 'Безнал — Картой',
    short: 'Карта',
    color: 'var(--card)',
    cashless: true,
    icon: `<rect x="2.5" y="5" width="19" height="14" rx="3"/>
           <path d="M2.5 10h19M6 14.5h4"/>`,
  },
  {
    id: 'cash',
    title: 'Наличными',
    short: 'Наличные',
    color: 'var(--cash)',
    cashless: false,
    icon: `<rect x="2.5" y="6" width="19" height="12" rx="2.5"/>
           <circle cx="12" cy="12" r="2.7"/>
           <path d="M6 12h.01M18 12h.01"/>`,
  },
  {
    id: 'spend',
    title: 'Траты',
    short: 'Траты',
    color: 'var(--spend)',
    cashless: false,
    expense: true,
    icon: `<circle cx="12" cy="12" r="8"/>
           <path d="M8 12h8"/>`,
  },
];

export const METHOD_IDS = METHODS.map((m) => m.id);

export const CASHLESS_IDS = METHODS.filter((m) => m.cashless).map((m) => m.id);

export const EXPENSE_IDS = METHODS.filter((m) => m.expense).map((m) => m.id);

const BY_ID = new Map(METHODS.map((m) => [m.id, m]));

export function getMethod(id) {
  return (
    BY_ID.get(id) ?? {
      id,
      title: id,
      short: id,
      color: 'var(--text-muted)',
      cashless: false,
      expense: false,
      icon: '',
    }
  );
}

export function isKnownMethod(id) {
  return BY_ID.has(id);
}

/** Подпись «QR + Карта» — собирается из данных, чтобы не разъезжалась при правках. */
export const CASHLESS_LABEL = METHODS.filter((m) => m.cashless)
  .map((m) => m.short)
  .join(' + ');
