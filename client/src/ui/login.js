// Ekran wejścia: nick i hasło.
//
// Zwykły formularz HTML nad kanwą, a nie rysowany w Phaserze — z tego bierze się
// za darmo pole hasła z kropkami, autouzupełnianie z menedżera haseł, polskie
// znaki i obsługa klawiatur mobilnych. Rysowanie tego własnym fontem oznaczałoby
// pisanie obsługi wpisywania tekstu od zera.
//
// Nie ma osobnej rejestracji: wolny nick zakłada konto, zajęty wymaga hasła.
// Cała różnica jest w komunikacie, który wraca z serwera.
//
// Świat jest już widoczny za spodem formularza — logowanie nie zasłania gry,
// tylko leży na niej. Wejście ma być pierwszym momentem, w którym widać kuźnię.

const REMEMBER_KEY = 'szab_nick';

/**
 * @param attempt async (nick, hasło) → `{ ok: true, name, fresh }` albo
 *                `{ ok: false, reason }`. Formularz zostaje otwarty do skutku.
 * @returns obietnica spełniana po udanym wejściu.
 */
export function showLogin(attempt) {
  const overlay = document.createElement('div');
  overlay.id = 'login';
  overlay.innerHTML = `
    <form id="login-box" autocomplete="on">
      <h1>SZABROWNICY</h1>
      <p class="login-sub">kuźnia</p>
      <label>nick
        <input name="username" type="text" maxlength="16" autocomplete="username"
               autocapitalize="off" spellcheck="false" required>
      </label>
      <label>hasło
        <input name="password" type="password" maxlength="72"
               autocomplete="current-password" required>
      </label>
      <button type="submit">wejdź do kuźni</button>
      <p class="login-msg"></p>
      <p class="login-hint">nowy nick zakłada konto — bez maila, bez potwierdzania</p>
    </form>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#login-box');
  const nick = form.elements.username;
  const pass = form.elements.password;
  const button = form.querySelector('button');
  const message = overlay.querySelector('.login-msg');

  nick.value = localStorage.getItem(REMEMBER_KEY) ?? '';
  // Kursor od razu tam, gdzie trzeba: przy zapamiętanym nicku od razu w hasło.
  setTimeout(() => (nick.value ? pass : nick).focus(), 60);

  const setBusy = (busy) => {
    button.disabled = busy;
    button.textContent = busy ? 'sprawdzam…' : 'wejdź do kuźni';
  };

  const fail = (reason) => {
    setBusy(false);
    message.textContent = reason;
    message.className = 'login-msg login-msg--bad';
    pass.select();
  };

  return new Promise((resolve) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;

      const name = nick.value.trim();
      if (name.length < 3) return fail('nick musi mieć co najmniej 3 znaki');
      if (pass.value.length < 4) return fail('hasło musi mieć co najmniej 4 znaki');

      setBusy(true);
      message.textContent = 'sprawdzam…';
      message.className = 'login-msg';

      const result = await attempt(name, pass.value);
      if (!result.ok) return fail(result.reason);

      localStorage.setItem(REMEMBER_KEY, result.name);
      overlay.classList.add('login--gone');
      // Zdjęcie z drzewa dopiero po zniknięciu, żeby przejście było widoczne.
      setTimeout(() => overlay.remove(), 400);
      resolve(result);
    });
  });
}
