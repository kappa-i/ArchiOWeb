import http from 'http';
import mongoose from 'mongoose';

import app from '../app.js';
import * as config from '../config.js';

// Connexion à MongoDB, puis démarrage du serveur
await mongoose.connect(config.databaseUrl);
console.log(`Connected to MongoDB at ${config.databaseUrl}`);

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
