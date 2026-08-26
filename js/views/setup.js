/**
 * Экран-заглушка, пока приложение не подключено к таблице.
 * Без него неподключённое приложение выглядело бы просто сломанным.
 */
export const title = 'Настройка';

export function subtitle() {
  return 'Требуется подключение к таблице';
}

export function mount(container) {
  container.innerHTML = `
    <div class="card card--pad setup">
      <h2 class="setup__title">Подключите таблицу</h2>
      <p class="setup__lead">
        Приложение хранит оплаты в Google Таблице и пока не знает, в какой именно.
        Настройка делается один раз и занимает несколько минут.
      </p>

      <ol class="setup__steps">
        <li>Создайте новую Google Таблицу.</li>
        <li>В ней откройте <b>Расширения → Apps Script</b>.</li>
        <li>Вставьте туда код из файла <code>apps-script/Code.gs</code> этого проекта.</li>
        <li>Замените в нём <code>TOKEN</code> на свою случайную строку.</li>
        <li>Запустите функцию <code>setup</code> и разрешите доступ.</li>
        <li>
          <b>Развёртывание → Новое развёртывание → Веб-приложение</b>,
          «Запуск от имени: я», «Доступ: все». Скопируйте ссылку на <code>/exec</code>.
        </li>
        <li>
          Впишите ссылку и тот же токен в файл <code>js/config.js</code>
          и обновите страницу.
        </li>
      </ol>

      <p class="setup__note">
        Подробная инструкция со скриншотами шагов — в файле <code>README.md</code> проекта.
      </p>
    </div>`;

  return { update() {}, destroy() {} };
}
