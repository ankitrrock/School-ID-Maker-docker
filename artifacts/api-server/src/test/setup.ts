// `@workspace/db` throws at import time if DATABASE_URL is unset, and the
// auth routes require a 32+ character JWT_SECRET. Neither needs a live
// Postgres connection just to construct the app / sign a token, so dummy
// values are enough for route-shape and middleware tests.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-only-secret-please-change-32-chars";
process.env.NODE_ENV = "test";
