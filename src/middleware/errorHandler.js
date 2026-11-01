import { toErrorResponse } from '../errors.js';

export const notFoundHandler = (req, _res, next) => {
  const err = new Error('Ruta no encontrada');
  err.status = 404;
  next(Object.assign(err, { route: `${req.method} ${req.path}` }));
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err.route) {
    return res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No existe ${err.route}` } });
  }
  const { status, body } = toErrorResponse(err);
  if (status === 500) console.error(err);
  res.status(status).json(body);
}
