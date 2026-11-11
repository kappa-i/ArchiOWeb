import express from 'express';
import logger from 'morgan';

import * as config from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import docsRoutes from './routes/docs.js';
import roomsRoutes from './routes/rooms.js';
import usersRoutes from './routes/users.js';

const app = express();

// Logs des requêtes dans le terminal (sauf pendant les tests)
if (config.env !== 'test') {
  app.use(logger('dev'));
}

app.use(express.json());

// Routes de l'API
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/rooms', roomsRoutes);

// Documentation (Swagger)
app.use('/api-docs', docsRoutes);

// Page d'accueil : redirige vers la documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Gestion des erreurs (toujours en dernier)
app.use(notFound);
app.use(errorHandler);

export default app;
