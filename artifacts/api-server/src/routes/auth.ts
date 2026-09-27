import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ACCESS_COOKIE, jwtSecret } from "../lib/auth";
import { ready } from "../lib/db-ready";
import { forgotPasswordRateLimit, loginRateLimit, signupRateLimit } from "../lib/rate-limit";

const router = Router();
const RESET_MINUTES = 30;

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function issueToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, jwtSecret(), {
    expiresIn: "7d",
  });
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

router.post("/auth/signup", signupRateLimit, async (req, res) => {
  await ready();

  const name = String(req.body?.name ?? "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  if (!name || !email || password.length < 6) {
    return res.status(400).json({
      message: "Name, valid email and a password of at least 6 characters are required.",
    });
  }

  const existing = await db.execute(sql`select id from users where email = ${email} limit 1`);
  if (existing.rows.length) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await db.execute(
    sql`insert into users (name, email, password_hash) values (${name}, ${email}, ${passwordHash}) returning id, name, email`,
  );
  const user = inserted.rows[0] as { id: string; name: string; email: string };

  setAuthCookie(res, issueToken(user));
  return res.status(201).json({ user });
});

router.post("/auth/login", loginRateLimit, async (req, res) => {
  await ready();

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  const result = await db.execute(
    sql`select id, name, email, password_hash from users where email = ${email} limit 1`,
  );
  const user = result.rows[0] as
    | { id: string; name: string; email: string; password_hash: string }
    | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  setAuthCookie(res, issueToken(user));
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

router.get("/auth/me", async (req, res) => {
  await ready();

  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret()) as { sub: string };
    const result = await db.execute(
      sql`select id, name, email from users where id = ${payload.sub} limit 1`,
    );
    if (!result.rows.length) {
      return res.status(401).json({ message: "Session is invalid." });
    }
    return res.json({ user: result.rows[0] });
  } catch {
    return res.status(401).json({ message: "Session is invalid or expired." });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(ACCESS_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res.json({ message: "Logged out." });
});

router.post("/auth/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  await ready();

  const email = normalizeEmail(req.body?.email);
  const result = await db.execute(sql`select id, email from users where email = ${email} limit 1`);
  const generic = {
    message: "If an account exists for this email, a password reset link has been created.",
  };

  if (!result.rows.length) {
    return res.json(generic);
  }

  const user = result.rows[0] as { id: string; email: string };
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await db.execute(
    sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`,
  );
  await db.execute(
    sql`insert into password_reset_tokens (user_id, token_hash, expires_at) values (${user.id}, ${tokenHash}, now() + (${RESET_MINUTES} * interval '1 minute'))`,
  );

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: "Reset your School ID Maker password",
      text: `Reset your password using this link (expires in ${RESET_MINUTES} minutes): ${resetUrl}`,
    });
  } else if (process.env.NODE_ENV !== "production") {
    console.log(`Password reset URL: ${resetUrl}`);
  }

  return res.json({
    ...generic,
    ...(process.env.NODE_ENV !== "production" ? { resetToken: rawToken } : {}),
  });
});

router.post("/auth/reset-password", async (req, res) => {
  await ready();

  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");
  if (!token || password.length < 6) {
    return res
      .status(400)
      .json({ message: "A reset token and password of at least 6 characters are required." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await db.execute(
    sql`select id, user_id from password_reset_tokens where token_hash = ${tokenHash} and used_at is null and expires_at > now() limit 1`,
  );
  if (!result.rows.length) {
    return res.status(400).json({ message: "This reset link is invalid or expired." });
  }

  const reset = result.rows[0] as { id: string; user_id: string };
  const passwordHash = await bcrypt.hash(password, 12);
  await db.execute(
    sql`update users set password_hash = ${passwordHash}, updated_at = now() where id = ${reset.user_id}`,
  );
  await db.execute(sql`update password_reset_tokens set used_at = now() where id = ${reset.id}`);

  return res.json({ message: "Password reset successfully. You can now log in." });
});

export default router;
