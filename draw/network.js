// Connexion temps réel au serveur (WebSocket), avec reconnexion automatique.
// Sans serveur, le dessin marche quand même, en solo.
export function connect(url, onMessage, onStatusChange) {
  let socket = null;

  function open() {
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      onStatusChange(true);
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage(message);
    });

    // Connexion perdue (ou serveur absent) : on réessaie dans 2 secondes
    socket.addEventListener('close', () => {
      onStatusChange(false);
      setTimeout(open, 2000);
    });
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  open();

  return { send };
}
