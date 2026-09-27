import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, schoolSettings } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { ready } from "../lib/db-ready";

const router = Router();
const ACCENTS = new Set(["indigo", "teal", "coral"]);

const DEFAULTS = {
  schoolName: "Northstar Academy",
  tagline: "Learn. Lead. Belong.",
  address: "",
  phone: "",
  defaultAccent: "indigo",
};

router.use(requireAuth);

router.get("/settings", async (req, res) => {
  await ready();
  const [row] = await db
    .select()
    .from(schoolSettings)
    .where(eq(schoolSettings.userId, req.userId!))
    .limit(1);

  if (!row) {
    return res.json(DEFAULTS);
  }
  const { userId: _userId, updatedAt: _updatedAt, ...settings } = row;
  return res.json(settings);
});

router.put("/settings", async (req, res) => {
  await ready();

  const b = (req.body ?? {}) as Record<string, unknown>;
  const schoolName = String(b.schoolName ?? "").trim();
  const tagline = String(b.tagline ?? "").trim();
  const address = String(b.address ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const defaultAccent = String(b.defaultAccent ?? "").trim();

  if (!schoolName || !tagline || !defaultAccent) {
    return res.status(400).json({ message: "schoolName, tagline and defaultAccent are required." });
  }
  if (!ACCENTS.has(defaultAccent)) {
    return res.status(400).json({ message: "defaultAccent must be one of: indigo, teal, coral." });
  }

  const values = { schoolName, tagline, address, phone, defaultAccent, updatedAt: new Date() };

  const [row] = await db
    .insert(schoolSettings)
    .values({ userId: req.userId!, ...values })
    .onConflictDoUpdate({ target: schoolSettings.userId, set: values })
    .returning();

  const { userId: _userId, updatedAt: _updatedAt, ...settings } = row;
  return res.json(settings);
});

export default router;
