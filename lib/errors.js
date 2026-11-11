// Crée une erreur avec un code HTTP (ex. 404), à lancer depuis une route
export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
