// Configuration lue depuis le fichier .env
export const env = process.env.NODE_ENV || 'development';

export const port = process.env.PORT || '3000';

export const databaseUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1/archioweb';

export const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('Environment variable $JWT_SECRET must be set');
}
