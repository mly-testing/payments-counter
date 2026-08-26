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

/** Короткая тактильная отдача там, где браузер это умеет (Android, десктоп Chrome). */
export function haptic(pattern = 8) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}
