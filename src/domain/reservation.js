// Funciones PURAS (sin E/S, sin mutar argumentos).

const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const FIELDS = ['room', 'title', 'start', 'end'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const parseDate = (v) => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const textBetween = (min, max) => (v) =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max
    ? { ok: v.trim() }
    : { error: `Debe ser texto de ${min} a ${max} caracteres` };

const isoDate = (v) => {
  const d = parseDate(v);
  return d ? { ok: d.toISOString() } : { error: 'Debe ser una fecha ISO-8601 válida' };
};

const validators = {
  room: textBetween(1, 50),
  title: textBetween(1, 120),
  start: isoDate,
  end: isoDate,
};

/**
 * Valida el cuerpo de una reserva.
 * @param {object} body
 * @param {{partial?: boolean}} opts partial=true para PATCH (campos opcionales)
 * @returns {{value: object, errors: Array<{field:string,message:string}>}}
 */
export function parseReservationInput(body, { partial = false } = {}) {
  if (!isPlainObject(body)) {
    return { value: {}, errors: [{ field: 'body', message: 'Debe ser un objeto JSON' }] };
  }
  const errors = [];
  const value = {};

  for (const key of Object.keys(body)) {
    if (!FIELDS.includes(key) && key !== 'version') {
      errors.push({ field: key, message: 'Campo no permitido' });
    }
  }
  for (const field of FIELDS) {
    if (body[field] === undefined) {
      if (!partial) errors.push({ field, message: 'Campo obligatorio' });
      continue;
    }
    const r = validators[field](body[field]);
    if (r.error) errors.push({ field, message: r.error });
    else value[field] = r.ok;
  }
  if (body.version !== undefined) {
    if (Number.isInteger(body.version) && body.version >= 1) value.version = body.version;
    else errors.push({ field: 'version', message: 'Debe ser un entero >= 1' });
  }
  return { value, errors };
}

/** Reglas que dependen de start y end juntos (ya normalizados a ISO). */
export function validateTimeRange({ start, end }) {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (e <= s) return [{ field: 'end', message: 'Debe ser posterior a start' }];
  if (e - s > MAX_DURATION_MS) return [{ field: 'end', message: 'La reserva no puede durar más de 8 horas' }];
  return [];
}

/** Dos intervalos semiabiertos [start, end) se solapan. */
export function overlaps(a, b) {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

/** Fila de BD -> DTO público. */
export const toDto = (row) => ({
  id: row.id,
  room: row.room,
  title: row.title,
  start: row.starts_at,
  end: row.ends_at,
  ownerId: row.user_id,
  version: row.version,
  createdAt: row.created_at,
});

/** Lista de DTOs -> CSV (RFC 4180). */
export function toCsv(reservations) {
  const header = ['id', 'room', 'title', 'start', 'end', 'ownerId', 'version'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = reservations.map((r) => header.map((h) => esc(r[h])).join(','));
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

/** Parseo seguro de paginación. */
export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
