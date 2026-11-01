import { AppError, badRequest, conflict } from '../errors.js';
import { hashPassword, parseCredentials, toPublicUser, verifyPassword } from '../domain/user.js';

export function createAuthService({ userRepo }) {
  return {
    register(body) {
      const { value, errors } = parseCredentials(body, { requireName: true });
      if (errors.length) throw badRequest(errors);
      if (userRepo.findByEmail(value.email)) throw conflict('EMAIL_TAKEN', 'El correo ya está registrado');
      const row = userRepo.create({
        email: value.email,
        name: value.name,
        passwordHash: hashPassword(value.password),
      });
      return toPublicUser(row);
    },

    login(body) {
      const { value, errors } = parseCredentials(body);
      if (errors.length) throw badRequest(errors);
      const row = userRepo.findByEmail(value.email);
      // Mensaje genérico: no revela si el correo existe.
      if (!row || !verifyPassword(value.password, row.password_hash))
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
      return toPublicUser(row);
    },

    me: (id) => {
      const row = userRepo.findById(id);
      return row ? toPublicUser(row) : null;
    },
  };
}
