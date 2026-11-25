import { createHttpError } from '../lib/errors.js';

const defaultPageSize = 10;
const maxPageSize = 100;

// Lit ?page= et ?pageSize= dans l'URL et les garde dans req.pagination (400 s'ils sont invalides).
// Exemple : ?page=2&pageSize=10 → on saute les 10 premiers et on en renvoie 10.
export function paginate(req, res, next) {
  const page = readPositiveInteger(req.query.page, 1, 'page');
  const pageSize = readPositiveInteger(req.query.pageSize, defaultPageSize, 'pageSize');

  if (pageSize > maxPageSize) {
    throw createHttpError(400, `pageSize must be at most ${maxPageSize}`);
  }

  req.pagination = {
    page: page,
    pageSize: pageSize,
    skip: (page - 1) * pageSize,
  };

  next();
}

// Transforme le texte de l'URL en nombre entier ≥ 1 (valeur par défaut s'il est absent)
function readPositiveInteger(value, defaultValue, name) {
  if (value === undefined) {
    return defaultValue;
  }

  const number = Number(value);

  // isSafeInteger : un nombre entier, et pas trop grand pour que les calculs restent justes
  if (!Number.isSafeInteger(number) || number < 1) {
    throw createHttpError(400, `${name} must be a positive integer`);
  }

  return number;
}
