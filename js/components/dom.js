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

/**
 * Приклеивает элемент к видимой области, а не к вёрстке страницы.
 *
 * На iPhone `position: fixed; inset: 0` считается от layout viewport, который
 * клавиатура не сжимает. Кнопки остаются за ней. visualViewport — это как раз
 * дырка над клавиатурой, и её координаты нужно проставлять самим.
 */
export function pinToVisualViewport(element) {
  if (!element) return;

  const viewport = window.visualViewport;
  element.style.position = 'fixed';
  element.style.right = 'auto';
  element.style.bottom = 'auto';

  if (!viewport) {
    element.style.top = '0';
    element.style.left = '0';
    element.style.width = '100%';
    element.style.height = '100%';
    return;
  }

  element.style.top = `${viewport.offsetTop}px`;
  element.style.left = `${viewport.offsetLeft}px`;
  element.style.width = `${viewport.width}px`;
  element.style.height = `${viewport.height}px`;
}

/** Короткая тактильная отдача там, где браузер это умеет (Android, десктоп Chrome). */
export function haptic(pattern = 8) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}
