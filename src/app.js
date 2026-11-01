import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createUserRepo } from './repositories/userRepo.js';
import { createReservationRepo } from './repositories/reservationRepo.js';
import { createAuthService } from './services/authService.js';
import { createReservationService } from './services/reservationService.js';
import { createRequireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/auth.js';
import { createReservationRouter } from './routes/reservations.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Composición de dependencias (inyección manual) y montaje de rutas. */
export function createApp({ db, sessionMiddleware, notify }) {
  const userRepo = createUserRepo(db);
  const reservationRepo = createReservationRepo(db);
  const authService = createAuthService({ userRepo });
  const reservationService = createReservationService({ repo: reservationRepo, notify });
  const requireAuth = createRequireAuth(authService);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(sessionMiddleware);
  app.use(express.static(publicDir));

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api/auth', createAuthRouter({ authService, requireAuth }));
  app.use('/api/reservations', createReservationRouter({ service: reservationService, requireAuth }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
