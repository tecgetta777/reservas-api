# Informe técnico – API de Reservas de Salas

**Asignatura:** _[Aplicaciones Web]_  **Estudiante:** _[Jhon Saavedra]_  **Repositorio:** _[none]_

## 1. Dominio y alcance
Se eligió la **gestión de reservas de salas**. Un usuario autenticado puede crear, consultar, modificar y cancelar reservas; el sistema impide que dos reservas se solapen en la misma sala. Es un dominio con una regla de negocio no trivial (conflictos), útil para demostrar transacciones y control de concurrencia.

## 2. Arquitectura
Stack: Node.js 22, Express 4, SQLite (better-sqlite3), express-session y Socket.IO. El código se organiza en capas con dependencias en una sola dirección:

`routes → services → repositories → db`, con `domain/` (funciones puras) usado por los servicios.

- **domain/**: validación, normalización de fechas, detección de solapamientos, generación de CSV y hash de contraseñas. No hacen E/S ni mutan sus argumentos; por eso se prueban sin servidor ni BD.
- **repositories/**: única capa que toca SQL.
- **services/**: reglas de negocio y transacciones; reciben `notify` por inyección, de modo que no dependen de Socket.IO.
- **routes/**: traducen HTTP a llamadas de servicio.

## 3. API REST
Rutas coherentes bajo `/api` (`/auth`, `/reservations`) con CRUD completo (GET, POST, PUT, PATCH, DELETE). Códigos usados: 200, 201 (con `Location`), 204, 400, 401, 403, 404 y 409. Todo error responde con la misma forma `{error:{code,message,details}}`, incluidos JSON mal formado y rutas inexistentes. La validación es de lista blanca: rechaza campos desconocidos, fechas inválidas, `end ≤ start` y duraciones mayores a 8 h, y devuelve todos los errores a la vez. El listado admite filtros (`room`, `from`, `to`) y paginación acotada.

## 4. Persistencia y conflictos
SQLite con esquema versionado en `db.js`, claves foráneas y restricción `CHECK (ends_at > starts_at)`. Todas las consultas son **parametrizadas**; los filtros dinámicos se arman con fragmentos fijos y valores como parámetros (se probó un intento de inyección SQL).
Se manejan dos tipos de conflicto:
1. **Solapamiento de horarios** (409 `RESERVATION_OVERLAP`): la comprobación y la inserción ocurren dentro de una transacción, por lo que no hay ventana para una doble reserva. Los intervalos son semiabiertos, así que 9–10 y 10–11 son compatibles.
2. **Edición concurrente** (409 `VERSION_CONFLICT`): bloqueo optimista con columna `version`; el `UPDATE` solo aplica si la versión coincide.

## 5. Sesión, archivo y tiempo real
- **Sesión**: registro/login/logout con cookie `httpOnly`. Las contraseñas se guardan con scrypt y sal. Solo el dueño puede modificar o borrar su reserva (403).
- **Archivo**: `GET /api/reservations/export.csv` descarga todas las reservas en CSV (escapado según RFC 4180).
- **Tiempo real**: Socket.IO comparte el middleware de sesión; solo se conectan clientes autenticados. Se emiten `reservation:created`, `updated` y `deleted`, que el servicio dispara después de confirmar el cambio en la BD. `public/index.html` muestra los eventos en vivo.

## 6. Pruebas
25 pruebas con `node:test` (`npm test`): 9 unitarias sobre funciones puras y 16 de integración contra un servidor real con BD en memoria. Cubren CRUD completo, validación, 401/403/404/409, paginación y filtros, inyección SQL, exportación CSV, y la recepción de los tres eventos de WebSocket (y el rechazo de conexiones sin sesión). Resultado: 25 aprobadas, 0 fallidas.

## 7. Limitaciones y trabajo futuro
El almacén de sesiones es en memoria (se pierde al reiniciar); en producción convendría uno persistente (p. ej. Redis o SQLite). Faltan límite de peticiones (rate limiting), CORS configurable, roles (administrador) y documentación OpenAPI. Los eventos se emiten a todos los clientes conectados; podrían segmentarse por sala.
