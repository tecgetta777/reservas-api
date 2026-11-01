import { Server } from 'socket.io';

/**
 * Tiempo real con Socket.IO. Comparte la sesión HTTP: solo clientes autenticados
 * pueden conectarse. Emite reservation:created | updated | deleted a todos.
 */
export function createRealtime(httpServer, sessionMiddleware) {
  const io = new Server(httpServer);
  io.engine.use(sessionMiddleware);
  io.use((socket, next) =>
    socket.request.session?.userId ? next() : next(new Error('UNAUTHORIZED'))
  );
  return {
    notify: (event, payload) => io.emit(event, payload),
    close: () => io.close(),
  };
}
