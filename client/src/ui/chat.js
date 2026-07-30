// Pole do pisania na czacie.
//
// Zwykły `<input>` nad kanwą, tak samo jak formularz logowania i suwaki. Z tego
// bierze się za darmo obsługa polskich znaków, wklejania, zaznaczania, cofania
// i klawiatur na telefonach. Sam tekst wiadomości rysuje już Phaser własnym
// fontem — w dymkach i w logu — więc w stylu gry zostaje wszystko poza jedną
// linijką, w której gracz właśnie pisze.
//
// Dopóki pole jest zamknięte, nie ma go w drzewie dokumentu w ogóle. Ukryty,
// ale wciąż zaznaczony `<input>` zjadałby klawisze ruchu — postać stałaby
// bezwładnie, a nie byłoby widać dlaczego.

/**
 * @param limit  najdłuższa wiadomość w znakach (musi zgadzać się z serwerem)
 * @param onSend wywoływane z gotowym tekstem po zatwierdzeniu Enterem
 */
export function createChatInput({ limit = 120, onSend }) {
  const box = document.createElement('div');
  box.id = 'chat-input';
  box.innerHTML = `
    <form autocomplete="off">
      <span class="chat-prompt">&gt;</span>
      <input type="text" maxlength="${limit}" autocomplete="off"
             autocapitalize="sentences" spellcheck="false">
      <span class="chat-left"></span>
    </form>
  `;

  const form = box.querySelector('form');
  const field = box.querySelector('input');
  const left = box.querySelector('.chat-left');

  // Licznik pokazuje się dopiero pod koniec limitu. Stale widoczna liczba przy
  // każdej krótkiej wiadomości tylko rozprasza.
  const refreshCounter = () => {
    const remaining = limit - field.value.length;
    left.textContent = remaining <= 24 ? String(remaining) : '';
  };

  let open = false;

  const close = () => {
    if (!open) return;
    open = false;
    field.blur();
    box.remove();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = field.value.trim();
    field.value = '';
    refreshCounter();
    close();
    if (text) onSend(text);
  });

  field.addEventListener('input', refreshCounter);

  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      field.value = '';
      refreshCounter();
      close();
    }
    // Zatrzymujemy zdarzenie na polu, żeby nie doszło do Phasera. Ten słucha
    // klawiatury na oknie, więc bez tego litera „m" wyciszałaby dźwięk w środku
    // pisania, a Enter, którym gracz wysyła wiadomość, otwierałby pole z powrotem.
    event.stopPropagation();
  });

  return {
    open() {
      if (open) return;
      open = true;
      document.body.appendChild(box);
      field.focus();
    },
    close,
    get isOpen() {
      return open;
    },
  };
}
