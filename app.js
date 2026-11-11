import express from 'express';
import logger from 'morgan';

import * as config from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import docsRoutes from './routes/docs.js';

const app = express();

// Log requests (except in test mode)
if (config.env !== 'test') {
  app.use(logger('dev'));
}

app.use(express.json());

// API documentation
app.use('/api-docs', docsRoutes);

// Redirect to the documentation by default
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

app.use(notFound);
app.use(errorHandler);

export default app;
