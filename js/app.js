import { describeError } from './api.js';
import { paymentsOfDay, todayKey, totalsOf } from './analytics.js';
import { initConfirm } from './components/confirm.js';
import { initToasts, showToast } from './components/toast.js';
import { isConfigured } from './config.js';
import { formatMoney } from './money.js';
import * as store from './store.js';
import * as entryView from './views/entry.js';
import * as historyView from './views/history.js';
import * as setupView from './views/setup.js';
import * as statsView from './views/stats.js';

const VIEWS = {
  entry: entryView,
  stats: statsView,
  history: historyView,
};

const DEFAULT_TAB = 'entry';

/** Данные считаются свежими столько времени; при возврате к вкладке позже — перечитываем. */
const STALE_AFTER_MS = 60_000;

const appEl = document.getElementById('app');
const viewEl = document.getElementById('view');
const tabbarEl = document.getElementById('tabbar');
const headerEl = document.querySelector('.app-header');
const headerTotalEl = document.getElementById('header-total');
const headerSubtitleEl = document.getElementById('header-subtitle');
const refreshEl = document.getElementById('refresh');
const syncEl = document.getElementById('sync');

let activeTab = null;
let activeView = null;
let lastKnownDay = todayKey();
let lastSyncAt = 0;

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
  window.scrollTo({ top: 0 });
  renderHeader();
}

/* ==========================================================================
   Шапка и полоса состояния
   ========================================================================== */

function renderHeader() {
  const todayTotals = totalsOf(paymentsOfDay(store.getPayments(), todayKey()));
  headerTotalEl.textContent = `Сегодня ${formatMoney(todayTotals.total)}`;
  headerSubtitleEl.textContent = VIEWS[activeTab]?.subtitle?.() ?? '';
  renderSync();
}

function renderSync() {
  const status = store.getStatus();

  refreshEl.classList.toggle('icon-btn--spinning', status === store.Status.Loading);
  refreshEl.disabled = status === store.Status.Loading;

  if (status === store.Status.Loading) {
    syncEl.hidden = false;
    syncEl.className = 'sync';
    syncEl.innerHTML = '<span class="spinner" aria-hidden="true"></span>Читаю таблицу…';
    return;
  }

  if (status === store.Status.Error) {
    syncEl.hidden = false;
    syncEl.className = 'sync sync--error';
    syncEl.innerHTML = `
      <span>⚠ ${describeError(store.getError())}</span>
      <button class="sync__retry" type="button" id="sync-retry">Повторить</button>`;
    syncEl.querySelector('#sync-retry').addEventListener('click', () => reload());
    return;
  }

  syncEl.hidden = true;
  syncEl.innerHTML = '';
}

/* ==========================================================================
   Загрузка данных
   ========================================================================== */

function reload({ silent = false } = {}) {
  return store
    .refresh()
    .then(() => {
      lastSyncAt = Date.now();
      if (!silent) showToast({ title: 'Данные обновлены', subtitle: subtitleForCount() });
    })
    .catch(() => {
      // Сообщение уже показано в полосе состояния под шапкой.
    });
}

function subtitleForCount() {
  const count = store.getCount();
  return count === 0 ? 'В таблице пока пусто' : `Записей в таблице: ${count}`;
}

/* ==========================================================================
   Запуск
   ========================================================================== */

function bootstrap() {
  initToasts();
  initConfirm();

  if (!isConfigured()) {
    appEl.classList.add('app--setup');
    const host = document.createElement('div');
    viewEl.replaceChildren(host);
    setupView.mount(host);
    headerTotalEl.hidden = true;
    refreshEl.hidden = true;
    headerSubtitleEl.textContent = 'Требуется подключение к таблице';
    return;
  }

  tabbarEl.addEventListener('click', (event) => {
    const button = event.target.closest('.tabbar__btn');
    if (button) location.hash = `#/${button.dataset.tab}`;
  });

  window.addEventListener('hashchange', () => activate(tabFromHash()));

  store.subscribe(() => {
    activeView?.update();
    renderHeader();
  });

  refreshEl.addEventListener('click', () => reload());

  window.addEventListener('scroll', () => {
    headerEl.classList.toggle('app-header--scrolled', window.scrollY > 4);
  }, { passive: true });

  // Приложение живёт в таблице, поэтому при возврате к нему данные могли
  // измениться. Плюс после смены суток «сегодня» должно поехать само.
  const onResume = () => {
    if (document.visibilityState === 'hidden') return;

    const currentDay = todayKey();
    if (currentDay !== lastKnownDay) {
      lastKnownDay = currentDay;
      activeView?.update();
      renderHeader();
    }
    if (Date.now() - lastSyncAt > STALE_AFTER_MS) reload({ silent: true });
  };
  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('focus', onResume);
  setInterval(onResume, STALE_AFTER_MS);

  activate(tabFromHash());
  reload({ silent: true });

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
