// Configuration lue depuis le fichier .env
export const env = process.env.NODE_ENV || 'development';

export const port = process.env.PORT || '3000';

export const databaseUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1/archioweb';

// Obligatoire pour l'API (vérifié au démarrage dans bin/start.js).
// Le serveur de test du dessin (npm run draw) n'en a pas besoin.
export const jwtSecret = process.env.JWT_SECRET;
