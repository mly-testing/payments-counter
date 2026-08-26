export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/** Делегирование событий: обработчик живёт на контейнере и переживает перерисовки. */
export function delegate(root, selector, eventName, handler) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}

/** Зазор между элементом и краем видимой области при прокрутке. */
const REVEAL_GAP = 12;

/**
 * Прокручивает страницу так, чтобы элемент попал в видимую область целиком.
 *
 * Штатный scrollIntoView считает по границам окна и не знает ни про залипающую
 * шапку, ни про таб-бар снизу, ни про всплывающую клавиатуру телефона, поэтому
 * оставляет нижний край элемента под ними.
 */
export function revealFully(element) {
  if (!element) return;

  // На телефоне клавиатура поднимает нижнюю границу видимой области, при этом
  // таб-бар остаётся у края окна — то есть уже за клавиатурой.
  const viewport = window.visualViewport;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;

  const tabbar = document.getElementById('tabbar');
  const header = document.querySelector('.app-header');
  const tabbarTop =
    tabbar && tabbar.offsetHeight > 0 ? tabbar.getBoundingClientRect().top : visibleBottom;

  const bottomLimit = Math.min(visibleBottom, tabbarTop) - REVEAL_GAP;
  const topLimit = (header ? header.getBoundingClientRect().bottom : 0) + REVEAL_GAP;

  const rect = element.getBoundingClientRect();
  const hiddenBelow = rect.bottom - bottomLimit;
  const hiddenAbove = topLimit - rect.top;

  // Когда элемент не влезает целиком, показываем его низ: там кнопки действий.
  if (hiddenBelow > 0) window.scrollBy({ top: hiddenBelow, behavior: 'smooth' });
  else if (hiddenAbove > 0) window.scrollBy({ top: -hiddenAbove, behavior: 'smooth' });
}

/** Короткая тактильная отдача там, где браузер это умеет (Android, десктоп Chrome). */
export function haptic(pattern = 8) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}
