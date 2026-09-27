import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { ACCESS_COOKIE, jwtSecret, requireAuth } from "./auth";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("jwtSecret", () => {
  it("throws when JWT_SECRET is too short", () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "too-short";
    expect(() => jwtSecret()).toThrow(/at least 32 characters/);
    process.env.JWT_SECRET = original;
  });

  it("returns the configured secret when valid", () => {
    expect(jwtSecret()).toBe(process.env.JWT_SECRET);
  });
});

describe("requireAuth", () => {
  it("responds 401 when no session cookie is present", () => {
    const req = { cookies: {} } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 when the cookie holds an invalid token", () => {
    const req = { cookies: { [ACCESS_COOKIE]: "not-a-real-token" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches userId and calls next() for a valid token", () => {
    const token = jwt.sign({ sub: "user-123", email: "a@b.com", name: "A" }, jwtSecret());
    const req = { cookies: { [ACCESS_COOKIE]: token } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe("user-123");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
