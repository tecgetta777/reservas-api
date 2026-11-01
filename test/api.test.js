import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../src/index.js';

let server, baseUrl;

before(async () => {
  server = createServer({ dbFile: ':memory:', sessionSecret: 'test' });
  await new Promise((r) => server.httpServer.listen(0, r));
  baseUrl = `http://localhost:${server.httpServer.address().port}`;
});
after(() => server.close());

/** Cliente HTTP mínimo que conserva la cookie de sesión. */
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* no JSON */ }
    return { status: res.status, headers: res.headers, body: json, text };
  };
  return { call, get cookie() { return cookie; } };
}

let seq = 0;
async function registered(name = 'Ana') {
  const c = client();
  const r = await c.call('POST', '/api/auth/register', {
    name, email: `${name.toLowerCase()}${++seq}@mail.com`, password: 'password123',
  });
  assert.equal(r.status, 201);
  return { c, user: r.body.data };
}

const slot = (h, len = 1, day = 1) => ({
  room: 'Sala-1',
  title: 'Reunión',
  start: `2031-03-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`,
  end: `2031-03-${String(day).padStart(2, '0')}T${String(h + len).padStart(2, '0')}:00:00Z`,
});

test('health responde 200', async () => {
  assert.equal((await client().call('GET', '/api/health')).status, 200);
});

test('registro: valida, crea y rechaza duplicados', async () => {
  const c = client();
  const bad = await c.call('POST', '/api/auth/register', { email: 'x', password: '1' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(bad.body.error.details));

  const body = { name: 'Luis', email: 'luis@mail.com', password: 'password123' };
  assert.equal((await c.call('POST', '/api/auth/register', body)).status, 201);
  const dup = await client().call('POST', '/api/auth/register', body);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
});

test('sesión: login, me, logout', async () => {
  const c = client();
  await c.call('POST', '/api/auth/register', { name: 'Eva', email: 'eva@mail.com', password: 'password123' });
  await c.call('POST', '/api/auth/logout');
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);

  const wrong = await c.call('POST', '/api/auth/login', { email: 'eva@mail.com', password: 'incorrecta1' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');

  const ok = await c.call('POST', '/api/auth/login', { email: 'eva@mail.com', password: 'password123' });
  assert.equal(ok.status, 200);
  assert.equal((await c.call('GET', '/api/auth/me')).body.data.email, 'eva@mail.com');
  assert.equal((await c.call('POST', '/api/auth/logout')).status, 204);
  assert.equal((await c.call('GET', '/api/auth/me')).status, 401);
});

test('reservas exigen sesión (401)', async () => {
  const r = await client().call('GET', '/api/reservations');
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'UNAUTHORIZED');
});

test('CRUD completo de reservas', async () => {
  const { c } = await registered('Crud');
  const created = await c.call('POST', '/api/reservations', slot(9, 1, 10));
  assert.equal(created.status, 201);
  assert.match(created.headers.get('location'), /^\/api\/reservations\/\d+$/);
  const id = created.body.data.id;
  assert.equal(created.body.data.version, 1);

  assert.equal((await c.call('GET', `/api/reservations/${id}`)).body.data.title, 'Reunión');

  const patched = await c.call('PATCH', `/api/reservations/${id}`, { title: 'Nuevo título' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.title, 'Nuevo título');
  assert.equal(patched.body.data.version, 2);

  const put = await c.call('PUT', `/api/reservations/${id}`, { ...slot(14, 2, 10), title: 'Reemplazo' });
  assert.equal(put.status, 200);
  assert.equal(put.body.data.version, 3);

  const incompletePut = await c.call('PUT', `/api/reservations/${id}`, { title: 'solo título' });
  assert.equal(incompletePut.status, 400);

  assert.equal((await c.call('DELETE', `/api/reservations/${id}`)).status, 204);
  const gone = await c.call('GET', `/api/reservations/${id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error.code, 'NOT_FOUND');
});

test('validación de entrada: rango, duración e id', async () => {
  const { c } = await registered('Val');
  const inverted = await c.call('POST', '/api/reservations', { ...slot(10), start: slot(11).start, end: slot(10).start });
  assert.equal(inverted.status, 400);
  const tooLong = await c.call('POST', '/api/reservations', slot(0, 10, 11));
  assert.equal(tooLong.status, 400);
  assert.equal((await c.call('GET', '/api/reservations/abc')).status, 400);
  assert.equal((await c.call('GET', '/api/reservations?from=nope')).status, 400);
});

test('JSON mal formado -> 400 con formato uniforme', async () => {
  const { c } = await registered('Json');
  const res = await fetch(baseUrl + '/api/reservations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: c.cookie },
    body: '{"room": ',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
});

test('conflicto de horario -> 409 y se permiten horarios contiguos', async () => {
  const { c } = await registered('Conf');
  assert.equal((await c.call('POST', '/api/reservations', slot(9, 2, 15))).status, 201); // 9-11
  const clash = await c.call('POST', '/api/reservations', slot(10, 2, 15)); // 10-12
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'RESERVATION_OVERLAP');
  assert.ok(clash.body.error.details.conflictWith.id);
  assert.equal((await c.call('POST', '/api/reservations', slot(11, 1, 15))).status, 201); // 11-12 contiguo
  const otherRoom = await c.call('POST', '/api/reservations', { ...slot(10, 1, 15), room: 'Sala-2' });
  assert.equal(otherRoom.status, 201);
});

test('bloqueo optimista: version desactualizada -> 409', async () => {
  const { c } = await registered('Ver');
  const { body } = await c.call('POST', '/api/reservations', slot(9, 1, 16));
  const id = body.data.id;
  assert.equal((await c.call('PATCH', `/api/reservations/${id}`, { title: 'v2', version: 1 })).status, 200);
  const stale = await c.call('PATCH', `/api/reservations/${id}`, { title: 'v3', version: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'VERSION_CONFLICT');
  assert.equal(stale.body.error.details.currentVersion, 2);
});

test('solo el dueño puede modificar o borrar (403)', async () => {
  const owner = await registered('Dueno');
  const other = await registered('Otro');
  const { body } = await owner.c.call('POST', '/api/reservations', slot(9, 1, 17));
  const id = body.data.id;
  const patch = await other.c.call('PATCH', `/api/reservations/${id}`, { title: 'hack' });
  assert.equal(patch.status, 403);
  assert.equal((await other.c.call('DELETE', `/api/reservations/${id}`)).status, 403);
  assert.equal((await other.c.call('GET', `/api/reservations/${id}`)).status, 200); // leer sí
});

test('listado con filtros y paginación', async () => {
  const { c } = await registered('List');
  for (const h of [8, 10, 12]) await c.call('POST', '/api/reservations', { ...slot(h, 1, 20), room: 'Lab' });
  const all = await c.call('GET', '/api/reservations?room=Lab&limit=2&page=1');
  assert.equal(all.status, 200);
  assert.equal(all.body.data.length, 2);
  assert.equal(all.body.meta.total, 3);
  const ranged = await c.call('GET', '/api/reservations?room=Lab&from=2031-03-20T09:30:00Z&to=2031-03-20T11:30:00Z');
  assert.equal(ranged.body.data.length, 1);
});

test('inyección SQL en filtros no rompe ni filtra de más', async () => {
  const { c } = await registered('Sqli');
  const r = await c.call('GET', `/api/reservations?room=${encodeURIComponent("x' OR '1'='1")}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 0);
});

test('función de archivo: exportación CSV', async () => {
  const { c } = await registered('Csv');
  await c.call('POST', '/api/reservations', { ...slot(9, 1, 25), title: 'Con, coma' });
  const r = await c.call('GET', '/api/reservations/export.csv');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /reservas\.csv/);
  assert.match(r.text, /^id,room,title,start,end,ownerId,version/);
  assert.match(r.text, /"Con, coma"/);
});

test('ruta inexistente -> 404 uniforme', async () => {
  const r = await client().call('GET', '/api/nada');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'ROUTE_NOT_FOUND');
});

test('tiempo real: se notifica creación, actualización y borrado', async () => {
  const { c } = await registered('Rt');
  const socket = ioClient(baseUrl, { extraHeaders: { cookie: c.cookie }, transports: ['websocket'] });
  await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', rej); });

  const next = (event) => new Promise((res) => socket.once(event, res));
  const created$ = next('reservation:created');
  const { body } = await c.call('POST', '/api/reservations', slot(9, 1, 27));
  assert.equal((await created$).id, body.data.id);

  const updated$ = next('reservation:updated');
  await c.call('PATCH', `/api/reservations/${body.data.id}`, { title: 'cambio' });
  assert.equal((await updated$).title, 'cambio');

  const deleted$ = next('reservation:deleted');
  await c.call('DELETE', `/api/reservations/${body.data.id}`);
  assert.deepEqual(await deleted$, { id: body.data.id });
  socket.close();
});

test('tiempo real: rechaza conexiones sin sesión', async () => {
  const socket = ioClient(baseUrl, { transports: ['websocket'], reconnection: false });
  const err = await new Promise((res) => socket.on('connect_error', res));
  assert.equal(err.message, 'UNAUTHORIZED');
  socket.close();
});
