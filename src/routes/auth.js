import { Router } from 'express';

export function createAuthRouter({ authService, requireAuth }) {
  const router = Router();

  // Regenerar la sesión al autenticar evita session fixation.
  const startSession = (req, res, next, user, status) =>
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.status(status).json({ data: user });
    });

  router.post('/register', (req, res, next) => {
    try {
      startSession(req, res, next, authService.register(req.body), 201);
    } catch (e) { next(e); }
  });

  router.post('/login', (req, res, next) => {
    try {
      startSession(req, res, next, authService.login(req.body), 200);
    } catch (e) { next(e); }
  });

  router.post('/logout', requireAuth, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid').status(204).end();
    });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ data: req.user }));

  return router;
}
