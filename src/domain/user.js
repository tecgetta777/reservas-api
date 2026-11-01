import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validación pura de credenciales. */
export function parseCredentials(body, { requireName = false } = {}) {
  const errors = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.push({ field: 'email', message: 'Correo inválido' });
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 100)
    errors.push({ field: 'password', message: 'Debe tener entre 8 y 100 caracteres' });
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (requireName && (name.length < 1 || name.length > 80))
    errors.push({ field: 'name', message: 'Debe tener entre 1 y 80 caracteres' });
  return { value: { email, password: b.password, name }, errors };
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = Buffer.from(scryptSync(password, salt, 64).toString('hex'));
  const expected = Buffer.from(hash);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export const toPublicUser = (row) => ({ id: row.id, email: row.email, name: row.name });
