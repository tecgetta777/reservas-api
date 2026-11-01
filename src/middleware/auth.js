import { unauthorized } from '../errors.js';

/** Exige sesión iniciada y deja el usuario en req.user. */
export function createRequireAuth(authService) {
  return (req, _res, next) => {
    const user = req.session?.userId ? authService.me(req.session.userId) : null;
    if (!user) return next(unauthorized());
    req.user = user;
    next();
  };
}
