import http from 'http';
import mongoose from 'mongoose';

import app from '../app.js';
import * as config from '../config.js';
import { attachRealtime } from '../lib/realtime.js';
import { cleanUpRoomsAtStartup } from '../lib/rooms.js';

// Sans secret, impossible de signer les jetons de connexion : l'API refuse de démarrer
if (!config.jwtSecret) {
  throw new Error('Environment variable $JWT_SECRET must be set');
}

// Connexion à MongoDB, puis démarrage du serveur
await mongoose.connect(config.databaseUrl);
console.log(`Connected to MongoDB at ${config.databaseUrl}`);

// Les parties en cours se sont arrêtées avec l'ancien serveur : on les termine,
// et les joueurs des salles d'attente qui ne reviennent pas seront retirés
await cleanUpRoomsAtStartup();

const server = http.createServer(app);

// Temps réel (WebSocket sur /ws) : il faut un compte et jouer dans la room
attachRealtime(server, config.jwtSecret);

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
