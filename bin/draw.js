import express from 'express';
import http from 'http';
import os from 'os';

import { attachRealtime } from '../lib/realtime.js';

// Serveur de test du module de dessin : la page draw/ + le temps réel.
// Pas besoin de MongoDB ni de compte : npm run draw, puis ouvrir la page dans 2 onglets.
const port = 3001;

const app = express();
app.use(express.static('draw'));

const server = http.createServer(app);
attachRealtime(server);

server.listen(port, () => {
  console.log(`Dessin : http://localhost:${port}`);

  // Adresse sur le réseau local, pour tester sur son téléphone (même Wi-Fi)
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`Sur ton téléphone : http://${address.address}:${port}`);
      }
    }
  }
});
