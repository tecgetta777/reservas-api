/** Error de aplicación con código HTTP y formato uniforme. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (details) =>
  new AppError(400, 'VALIDATION_ERROR', 'Datos de entrada inválidos', details);
export const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión');
export const forbidden = (msg = 'No tiene permiso sobre este recurso') =>
  new AppError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Recurso') =>
  new AppError(404, 'NOT_FOUND', `${what} no encontrado`);
export const conflict = (code, message, details) =>
  new AppError(409, code, message, details);

/** Transformación pura: error -> { status, body } con formato uniforme. */
export function toErrorResponse(err) {
  if (err instanceof AppError) {
    const error = { code: err.code, message: err.message };
    if (err.details) error.details = err.details;
    return { status: err.status, body: { error } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: { code: 'INVALID_JSON', message: 'JSON mal formado' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } } };
}
