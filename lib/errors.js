/**
 * Creates an error with an HTTP status code, to be thrown from a route
 * and turned into a JSON response by the error handler.
 */
export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
