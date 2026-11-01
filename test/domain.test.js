import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, parseReservationInput, toCsv, validateTimeRange, parsePagination } from '../src/domain/reservation.js';
import { hashPassword, verifyPassword } from '../src/domain/user.js';
import { toErrorResponse, conflict } from '../src/errors.js';

const base = { room: 'A1', title: 'Reunión', start: '2030-01-01T10:00:00Z', end: '2030-01-01T11:00:00Z' };

test('parseReservationInput normaliza y no muta la entrada', () => {
  const input = Object.freeze({ ...base, room: '  A1  ' });
  const { value, errors } = parseReservationInput(input);
  assert.equal(errors.length, 0);
  assert.equal(value.room, 'A1');
  assert.equal(value.start, '2030-01-01T10:00:00.000Z');
});

test('parseReservationInput reporta campos faltantes, inválidos y extra', () => {
  const { errors } = parseReservationInput({ room: '', start: 'mañana', extra: 1 });
  const fields = errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['end', 'extra', 'room', 'start', 'title']);
});

test('parseReservationInput parcial acepta subconjuntos', () => {
  assert.equal(parseReservationInput({ title: 'x' }, { partial: true }).errors.length, 0);
});

test('validateTimeRange: orden y duración máxima', () => {
  assert.equal(validateTimeRange(base).length, 0);
  assert.equal(validateTimeRange({ start: base.end, end: base.start }).length, 1);
  assert.equal(validateTimeRange({ start: base.start, end: '2030-01-01T20:00:00Z' }).length, 1);
});

test('overlaps usa intervalos semiabiertos', () => {
  const a = { start: '2030-01-01T10:00:00Z', end: '2030-01-01T11:00:00Z' };
  assert.equal(overlaps(a, { start: '2030-01-01T10:30:00Z', end: '2030-01-01T12:00:00Z' }), true);
  assert.equal(overlaps(a, { start: '2030-01-01T11:00:00Z', end: '2030-01-01T12:00:00Z' }), false);
});

test('toCsv escapa comas y comillas', () => {
  const csv = toCsv([{ id: 1, room: 'A', title: 'Hola, "mundo"', start: 's', end: 'e', ownerId: 2, version: 1 }]);
  assert.match(csv, /"Hola, ""mundo"""/);
});

test('parsePagination acota valores', () => {
  assert.deepEqual(parsePagination({ page: '-3', limit: '9999' }), { page: 1, limit: 100, offset: 0 });
});

test('hash/verify de contraseña', () => {
  const h = hashPassword('secreto123');
  assert.equal(verifyPassword('secreto123', h), true);
  assert.equal(verifyPassword('otra-cosa', h), false);
});

test('toErrorResponse da formato uniforme', () => {
  const { status, body } = toErrorResponse(conflict('X', 'msg', { a: 1 }));
  assert.equal(status, 409);
  assert.deepEqual(body, { error: { code: 'X', message: 'msg', details: { a: 1 } } });
  assert.equal(toErrorResponse(new Error('boom')).status, 500);
});
