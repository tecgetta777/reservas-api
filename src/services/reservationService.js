import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { parsePagination, parseReservationInput, toDto, validateTimeRange } from '../domain/reservation.js';

/**
 * Orquesta dominio puro + repositorio + notificaciones.
 * `notify(evento, payload)` se inyecta (tiempo real) para no acoplar el servicio a Socket.IO.
 */
export function createReservationService({ repo, notify = () => {} }) {
  const mustFind = (id) => {
    const row = repo.findById(id);
    if (!row) throw notFound('Reserva');
    return row;
  };
  const assertOwner = (row, user) => {
    if (row.user_id !== user.id) throw forbidden('Solo el dueño puede modificar esta reserva');
  };
  const assertNoConflict = ({ room, start, end }, excludeId) => {
    const other = repo.findConflict({ room, start, end, excludeId });
    if (other) {
      throw conflict('RESERVATION_OVERLAP', 'La sala ya está reservada en ese horario', {
        conflictWith: toDto(other),
      });
    }
  };
  const validated = (body, opts) => {
    const { value, errors } = parseReservationInput(body, opts);
    if (errors.length) throw badRequest(errors);
    return value;
  };

  return {
    list(query) {
      const errors = [];
      const toIso = (field) => {
        if (!query[field]) return undefined;
        const d = new Date(query[field]);
        if (Number.isNaN(d.getTime())) {
          errors.push({ field, message: 'Debe ser una fecha ISO-8601 válida' });
          return undefined;
        }
        return d.toISOString();
      };
      const filters = {
        room: typeof query.room === 'string' ? query.room : undefined,
        from: toIso('from'),
        to: toIso('to'),
      };
      if (errors.length) throw badRequest(errors);
      const page = parsePagination(query);
      const { rows, total } = repo.list(filters, page);
      return { data: rows.map(toDto), meta: { page: page.page, limit: page.limit, total } };
    },

    listAll: () => repo.list({}, { limit: 100000, offset: 0 }).rows.map(toDto),

    get: (id) => toDto(mustFind(id)),

    create(user, body) {
      const input = validated(body);
      const rangeErrors = validateTimeRange(input);
      if (rangeErrors.length) throw badRequest(rangeErrors);

      // Transacción: comprobar + insertar es atómico (evita doble reserva).
      const row = repo.transaction(() => {
        assertNoConflict(input);
        return repo.create({ ...input, userId: user.id });
      });
      const dto = toDto(row);
      notify('reservation:created', dto);
      return dto;
    },

    /** PUT (reemplazo total) y PATCH (parcial) comparten esta ruta de actualización. */
    update(user, id, body, { partial }) {
      const patch = validated(body, { partial });
      if (partial && Object.keys(patch).filter((k) => k !== 'version').length === 0) {
        throw badRequest([{ field: 'body', message: 'Debe incluir al menos un campo a modificar' }]);
      }
      const updated = repo.transaction(() => {
        const current = mustFind(id);
        assertOwner(current, user);

        const next = {
          room: patch.room ?? current.room,
          title: patch.title ?? current.title,
          start: patch.start ?? current.starts_at,
          end: patch.end ?? current.ends_at,
        };
        const rangeErrors = validateTimeRange(next);
        if (rangeErrors.length) throw badRequest(rangeErrors);
        assertNoConflict(next, id);

        const version = patch.version ?? current.version;
        if (repo.update({ ...next, id, version }) === 0) {
          throw conflict('VERSION_CONFLICT', 'La reserva fue modificada por otra petición', {
            currentVersion: current.version,
          });
        }
        return repo.findById(id);
      });
      const dto = toDto(updated);
      notify('reservation:updated', dto);
      return dto;
    },

    remove(user, id) {
      const current = mustFind(id);
      assertOwner(current, user);
      repo.remove(id);
      notify('reservation:deleted', { id });
    },
  };
}
