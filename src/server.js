import { createServer } from './index.js';

const PORT = Number(process.env.PORT) || 3000;
const { httpServer } = createServer({
  dbFile: process.env.DB_FILE || 'data/reservas.db',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
});

httpServer.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`));
