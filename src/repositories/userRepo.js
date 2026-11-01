/** Acceso a datos de usuarios. Solo sentencias preparadas (sin concatenar entrada). */
export function createUserRepo(db) {
  const insert = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');

  return {
    create: ({ email, name, passwordHash }) => {
      const { lastInsertRowid } = insert.run(email, name, passwordHash);
      return byId.get(lastInsertRowid);
    },
    findByEmail: (email) => byEmail.get(email),
    findById: (id) => byId.get(id),
  };
}
