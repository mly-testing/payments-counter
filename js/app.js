import { paymentsOfDay, todayKey, totalsOf } from './analytics.js';
import { initToasts, showError } from './components/toast.js';
import { formatMoney } from './money.js';
import * as store from './store.js';
import * as entryView from './views/entry.js';
import * as historyView from './views/history.js';
import * as statsView from './views/stats.js';

const VIEWS = {
  entry: entryView,
  stats: statsView,
  history: historyView,
};

const DEFAULT_TAB = 'entry';

const viewEl = document.getElementById('view');
const tabbarEl = document.getElementById('tabbar');
const headerEl = document.querySelector('.app-header');
const headerTotalEl = document.getElementById('header-total');
const headerSubtitleEl = document.getElementById('header-subtitle');

let activeTab = null;
let activeView = null;
let lastKnownDay = todayKey();

/* ==========================================================================
   Навигация
   ========================================================================== */

function tabFromHash() {
  const tab = location.hash.replace(/^#\/?/, '');
  return tab in VIEWS ? tab : DEFAULT_TAB;
}

function activate(tab) {
  if (tab === activeTab) return;

  activeView?.destroy?.();

  // Каждый экран монтируется в собственный контейнер: вместе с ним удаляются
  // и его делегированные слушатели, иначе они копились бы при переключениях.
  const host = document.createElement('div');
  viewEl.replaceChildren(host);

  activeTab = tab;
  activeView = VIEWS[tab].mount(host);
  activeView.update();

  for (const button of tabbarEl.children) {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  }
  viewEl.scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0 });
  updateHeader();
}

function updateHeader() {
  const todayTotals = totalsOf(paymentsOfDay(store.getPayments(), todayKey()));
  headerTotalEl.textContent = `Сегодня ${formatMoney(todayTotals.total)}`;
  headerSubtitleEl.textContent = VIEWS[activeTab]?.subtitle?.() ?? '';
}

/* ==========================================================================
   Запуск
   ========================================================================== */

function bootstrap() {
  initToasts();
  store.init();

  tabbarEl.addEventListener('click', (event) => {
    const button = event.target.closest('.tabbar__btn');
    if (button) location.hash = `#/${button.dataset.tab}`;
  });

  window.addEventListener('hashchange', () => activate(tabFromHash()));

  store.subscribe(() => {
    activeView?.update();
    updateHeader();
  });

  document.addEventListener('view:header-changed', updateHeader);

  window.addEventListener('scroll', () => {
    headerEl.classList.toggle('app-header--scrolled', window.scrollY > 4);
  }, { passive: true });

  // Приложение часто остаётся открытым сутками — после смены даты
  // «сегодня» должно поехать само, без перезагрузки.
  const refreshIfDayChanged = () => {
    const current = todayKey();
    if (current === lastKnownDay) return;
    lastKnownDay = current;
    activeView?.update();
    updateHeader();
  };
  document.addEventListener('visibilitychange', refreshIfDayChanged);
  window.addEventListener('focus', refreshIfDayChanged);
  setInterval(refreshIfDayChanged, 60_000);

  activate(tabFromHash());

  if (!store.isStorageAvailable()) {
    showError('Локальное хранилище недоступно', 'Отключите приватный режим браузера');
  }

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.warn('Service worker не зарегистрирован:', error));
  });
}

bootstrap();
