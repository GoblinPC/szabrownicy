// Serwer deweloperski obserwuje katalog klienta i wysyła sygnał po każdej zmianie
// pliku. Dzięki temu poprawki grafiki i kodu widać bez ręcznego odświeżania.

export function connectLiveReload() {
  if (location.protocol === 'file:') return;

  let socket;
  const connect = () => {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    socket.addEventListener('message', (event) => {
      try {
        if (JSON.parse(event.data).t === 'reload') location.reload();
      } catch { /* wiadomości gry obsłuży osobny moduł sieciowy */ }
    });
    // Serwer restartowany ręcznie — próbujemy wrócić, zamiast zostawiać martwą kartę.
    socket.addEventListener('close', () => setTimeout(connect, 1200));
  };
  connect();
}
