import * as config from '../config.js';
import { createHttpError } from '../lib/errors.js';

// Adresse inconnue : 404
export function notFound(req, res, next) {
  const error = createHttpError(404, 'Not Found');
  next(error);
}

// Transforme toute erreur en réponse JSON avec le bon code (422, 409, 401, 500…)
export function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    err.status = 422;
  }

  if (err.code === 11000) {
    err.status = 409;
    err.message = 'A resource with the same value already exists';
  }

  const status = err.status || 500;

  const response = {
    message: err.message,
  };

  if (err.name === 'ValidationError') {
    response.errors = err.errors;
  }

  if (status === 401) {
    res.set('WWW-Authenticate', 'Bearer');
  }

  // Erreur imprévue : on ne montre pas les détails au client
  if (status === 500) {
    if (config.env !== 'test') {
      console.error(err);
    }
    response.message = 'Internal Server Error';
  }

  res.status(status).send(response);
}
