import { createHttpError } from '../lib/errors.js';

// Périodes acceptées : depuis toujours, 30 derniers jours, 7 derniers jours, dernières 24 h
const periods = ['all', 'month', 'week', 'day'];

// Lit ?period= dans l'URL et le garde dans req.period (« all » par défaut, 400 s'il est inconnu)
export function readPeriod(req, res, next) {
  let period = 'all';
  if (req.query.period !== undefined) {
    period = req.query.period;
  }

  if (!periods.includes(period)) {
    throw createHttpError(400, 'period must be all, month, week or day');
  }

  req.period = period;
  next();
}
