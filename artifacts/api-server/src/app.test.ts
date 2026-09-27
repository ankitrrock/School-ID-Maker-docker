import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app";

describe("GET /api/healthz", () => {
  it("returns healthy status", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("protected routes", () => {
  it("rejects /api/students without a session", async () => {
    const res = await request(app).get("/api/students");
    expect(res.status).toBe(401);
  });

  it("rejects /api/settings without a session", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });
});
