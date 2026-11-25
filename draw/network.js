// Connexion temps réel au serveur (WebSocket), avec reconnexion automatique.
// Sans serveur, le dessin marche quand même, en solo.
// onRefused (facultatif) : appelé si le serveur refuse la connexion (room supprimée, plus joueur de la room…).
export function connect(url, onMessage, onStatusChange, onRefused) {
  let socket = null;
  let isClosed = false; // fermée exprès avec close() : on ne se reconnecte plus

  function open() {
    if (isClosed) {
      return;
    }

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

    socket.addEventListener('close', (event) => {
      onStatusChange(false);

      if (isClosed) {
        return;
      }

      // Refusée par le serveur (code 1008) : inutile de réessayer
      if (event.code === 1008) {
        if (onRefused) {
          onRefused();
        }
        return;
      }

      // Connexion perdue (ou serveur absent) : on réessaie dans 2 secondes
      setTimeout(open, 2000);
    });
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function close() {
    isClosed = true;
    if (socket) {
      socket.close();
    }
  }

  open();

  return { send, close };
}
