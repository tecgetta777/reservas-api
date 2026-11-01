import { createServer as createHttpServer } from 'node:http';
import session from 'express-session';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';

/** Fábrica del servidor completo (HTTP + sesiones + Socket.IO + BD). */
export function createServer({ dbFile = ':memory:', sessionSecret = 'dev-secret-change-me' } = {}) {
  const db = openDb(dbFile);
  const sessionMiddleware = session({
    name: 'sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  });

  // `notify` se resuelve de forma perezosa: Express se crea antes que Socket.IO
  // (Socket.IO debe engancharse a un servidor HTTP que ya tenga su handler).
  let realtime = { notify: () => {}, close: () => {} };
  const app = createApp({ db, sessionMiddleware, notify: (e, p) => realtime.notify(e, p) });
  const httpServer = createHttpServer(app);
  realtime = createRealtime(httpServer, sessionMiddleware);

  return {
    httpServer,
    close: () =>
      new Promise((resolve) => {
        realtime.close(); // cierra también el httpServer
        db.close();
        resolve();
      }),
  };
}
