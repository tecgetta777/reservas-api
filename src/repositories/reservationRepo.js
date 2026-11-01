/** Acceso a datos de reservas. Todas las consultas son parametrizadas. */
export function createReservationRepo(db) {
  const insert = db.prepare(
    'INSERT INTO reservations (room, title, starts_at, ends_at, user_id) VALUES (@room, @title, @start, @end, @userId)'
  );
  const byId = db.prepare('SELECT * FROM reservations WHERE id = ?');
  const remove = db.prepare('DELETE FROM reservations WHERE id = ?');
  // Optimistic locking: solo actualiza si la versión coincide.
  const update = db.prepare(`
    UPDATE reservations
       SET room = @room, title = @title, starts_at = @start, ends_at = @end, version = version + 1
     WHERE id = @id AND version = @version`);
  // Solapamiento de intervalos [start, end) en la misma sala, excluyendo la propia reserva.
  const conflicting = db.prepare(`
    SELECT * FROM reservations
     WHERE room = @room AND starts_at < @end AND ends_at > @start AND id != @excludeId
     LIMIT 1`);

  /** Construye WHERE a partir de fragmentos fijos; los valores van siempre como parámetros. */
  function buildFilter({ room, from, to }) {
    const clauses = [];
    const params = {};
    if (room) { clauses.push('room = @room'); params.room = room; }
    if (from) { clauses.push('ends_at > @from'); params.from = from; }
    if (to) { clauses.push('starts_at < @to'); params.to = to; }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  return {
    transaction: (fn) => db.transaction(fn)(),
    create: (data) => byId.get(insert.run(data).lastInsertRowid),
    findById: (id) => byId.get(id),
    findConflict: ({ room, start, end, excludeId = 0 }) => conflicting.get({ room, start, end, excludeId }),
    update: (data) => update.run(data).changes,
    remove: (id) => remove.run(id).changes,
    list: (filters, { limit, offset }) => {
      const { where, params } = buildFilter(filters);
      const rows = db
        .prepare(`SELECT * FROM reservations ${where} ORDER BY starts_at ASC, id ASC LIMIT @limit OFFSET @offset`)
        .all({ ...params, limit, offset });
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM reservations ${where}`).get(params);
      return { rows, total };
    },
  };
}
