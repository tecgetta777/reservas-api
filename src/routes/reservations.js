import { Router } from 'express';
import { badRequest } from '../errors.js';
import { toCsv } from '../domain/reservation.js';

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw badRequest([{ field: 'id', message: 'Debe ser un entero positivo' }]);
  return id;
};

export function createReservationRouter({ service, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  // Función de archivo: descarga CSV. Debe ir antes de '/:id'.
  router.get('/export.csv', (_req, res, next) => {
    try {
      res
        .status(200)
        .type('text/csv; charset=utf-8')
        .attachment('reservas.csv')
        .send(toCsv(service.listAll()));
    } catch (e) { next(e); }
  });

  router.get('/', (req, res, next) => {
    try { res.json(service.list(req.query)); } catch (e) { next(e); }
  });

  router.get('/:id', (req, res, next) => {
    try { res.json({ data: service.get(parseId(req.params.id)) }); } catch (e) { next(e); }
  });

  router.post('/', (req, res, next) => {
    try {
      const created = service.create(req.user, req.body);
      res.status(201).location(`/api/reservations/${created.id}`).json({ data: created });
    } catch (e) { next(e); }
  });

  router.put('/:id', (req, res, next) => {
    try {
      res.json({ data: service.update(req.user, parseId(req.params.id), req.body, { partial: false }) });
    } catch (e) { next(e); }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      res.json({ data: service.update(req.user, parseId(req.params.id), req.body, { partial: true }) });
    } catch (e) { next(e); }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      service.remove(req.user, parseId(req.params.id));
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}
