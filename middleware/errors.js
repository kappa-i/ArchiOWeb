import * as config from '../config.js';
import { createHttpError } from '../lib/errors.js';

export function notFound(req, res, next) {
  const error = createHttpError(404, 'Not Found');
  next(error);
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  const response = {
    message: err.message,
  };

  // Unexpected error: log it, but do not show internal details to the client
  if (status === 500) {
    if (config.env !== 'test') {
      console.error(err);
    }
    response.message = 'Internal Server Error';
  }

  res.status(status).send(response);
}
