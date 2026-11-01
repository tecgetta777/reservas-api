# API de Reservas de Salas

API REST en **Node.js + Express** con persistencia en **SQLite**, **sesiones** (cookie) y **tiempo real** con Socket.IO.

## Requisitos e instalación

```bash
node -v        # >= 20
npm install
npm start      # http://localhost:3000   (BD en data/reservas.db)
npm test       # 25 pruebas (node:test, sin framework extra)
```

Variables opcionales: `PORT`, `DB_FILE`, `SESSION_SECRET`.
Demo de tiempo real: abre `http://localhost:3000` en el navegador.

## Estructura (capas)

```
src/
  domain/         # Funciones PURAS: validación, solapamientos, CSV, hash (sin E/S)
  repositories/   # E/S: consultas SQL parametrizadas
  services/       # Reglas de negocio, transacciones, notificaciones
  routes/         # HTTP: traduce req/res <-> servicios
  middleware/     # Autenticación y manejo uniforme de errores
  realtime.js     # Socket.IO compartiendo la sesión HTTP
  app.js / index.js / server.js   # Composición y arranque
test/             # Unitarias (dominio) + integración (endpoints, WebSocket)
```

## Endpoints

| Método | Ruta | Descripción | Éxito | Errores |
|---|---|---|---|---|
| POST | `/api/auth/register` | Crea usuario e inicia sesión | 201 | 400, 409 |
| POST | `/api/auth/login` | Inicia sesión | 200 | 400, 401 |
| POST | `/api/auth/logout` | Cierra sesión | 204 | 401 |
| GET | `/api/auth/me` | Usuario de la sesión | 200 | 401 |
| GET | `/api/reservations` | Lista (`room`, `from`, `to`, `page`, `limit`) | 200 | 400, 401 |
| GET | `/api/reservations/:id` | Detalle | 200 | 400, 401, 404 |
| POST | `/api/reservations` | Crear | 201 | 400, 401, 409 |
| PUT | `/api/reservations/:id` | Reemplazo total | 200 | 400, 401, 403, 404, 409 |
| PATCH | `/api/reservations/:id` | Actualización parcial | 200 | 400, 401, 403, 404, 409 |
| DELETE | `/api/reservations/:id` | Eliminar | 204 | 401, 403, 404 |
| GET | `/api/reservations/export.csv` | **Archivo**: descarga CSV | 200 | 401 |

Formato de error uniforme: `{"error": {"code": "...", "message": "...", "details": ...}}`

## Eventos en tiempo real (Socket.IO)

Solo se conectan clientes con sesión activa. Eventos emitidos:
`reservation:created`, `reservation:updated` (payload: la reserva) y `reservation:deleted` (`{"id": 1}`).

```js
const socket = io();   // en el navegador, con la cookie de sesión
socket.on('reservation:created', (r) => console.log('Nueva reserva', r));
```

## Ejemplos (resultados reales)

```bash
# Registro (guarda la cookie de sesión)
curl -c cj -H 'Content-Type: application/json' -X POST localhost:3000/api/auth/register \
  -d '{"name":"Ana Pérez","email":"ana@mail.com","password":"clave12345"}'
```
```json
201  {"data":{"id":1,"email":"ana@mail.com","name":"Ana Pérez"}}
```

```bash
# Crear reserva
curl -b cj -H 'Content-Type: application/json' -X POST localhost:3000/api/reservations \
  -d '{"room":"Sala-A","title":"Revisión de sprint","start":"2030-05-10T09:00:00Z","end":"2030-05-10T10:30:00Z"}'
```
```json
201  Location: /api/reservations/1
{"data":{"id":1,"room":"Sala-A","title":"Revisión de sprint","start":"2030-05-10T09:00:00.000Z",
 "end":"2030-05-10T10:30:00.000Z","ownerId":1,"version":1,"createdAt":"2026-10-31T23:53:16.608Z"}}
```

**Conflicto de horario (409)** — mismo cuarto, 10:00–11:00 solapa con 09:00–10:30:
```json
{"error":{"code":"RESERVATION_OVERLAP","message":"La sala ya está reservada en ese horario",
 "details":{"conflictWith":{"id":1,"room":"Sala-A","title":"Revisión de sprint", "...":"..."}}}}
```

**Validación (400):**
```json
{"error":{"code":"VALIDATION_ERROR","message":"Datos de entrada inválidos","details":[
 {"field":"room","message":"Debe ser texto de 1 a 50 caracteres"},
 {"field":"title","message":"Campo obligatorio"},
 {"field":"start","message":"Debe ser una fecha ISO-8601 válida"},
 {"field":"end","message":"Campo obligatorio"}]}}
```

**Actualización parcial con bloqueo optimista** (`version` opcional):
```bash
curl -b cj -H 'Content-Type: application/json' -X PATCH localhost:3000/api/reservations/1 \
  -d '{"title":"Sprint review","version":1}'          # 200, version pasa a 2
```
Reenviar `"version":1` otra vez responde `409 VERSION_CONFLICT` con `currentVersion`.

**Sin sesión (401):** `{"error":{"code":"UNAUTHORIZED","message":"Debe iniciar sesión"}}`

**CSV (200, `text/csv`, `Content-Disposition: attachment; filename="reservas.csv"`):**
```
id,room,title,start,end,ownerId,version
1,Sala-A,Sprint review,2030-05-10T09:00:00.000Z,2030-05-10T10:30:00.000Z,1,2
```

## Notas de seguridad
- Consultas SQL parametrizadas (probado con intento de inyección).
- Contraseñas con `scrypt` + sal; comparación en tiempo constante.
- Cookie `httpOnly`, `sameSite=lax`; la sesión se regenera al autenticar (anti session-fixation).
- El almacén de sesiones es en memoria (suficiente para el curso); en producción usar uno persistente.
