// Preloaded only by the Docker command, before the application imports its config.
if (!process.env.JWT_SECRET) {
  const { loadOrCreateSecret } = require('./jwt-secret');
  process.env.JWT_SECRET = loadOrCreateSecret(process.env.JWT_SECRET_FILE || '/app/data/secrets/jwt-secret');
}
