import jwt from 'jsonwebtoken';

import { jwtSecret } from '../config.js';
import { createHttpError } from '../lib/errors.js';

// Vérifie le jeton envoyé dans le header « Authorization: Bearer <jeton> »
export function authenticate(req, res, next) {
  const authorization = req.get('Authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(createHttpError(401, 'A bearer token is required'));
  }

  const token = authorization.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.currentUserId = payload.sub;
    next();
  } catch {
    next(createHttpError(401, 'Your token is invalid or has expired'));
  }
}
