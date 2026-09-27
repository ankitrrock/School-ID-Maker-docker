import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, studentCards } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { ready } from "../lib/db-ready";

const router = Router();
const ACCENTS = new Set(["indigo", "teal", "coral"]);

interface StudentCardInput {
  name: string;
  studentId: string;
  className: string;
  section: string;
  bloodGroup: string;
  schoolName: string;
  academicYear: string;
  photoUrl?: string | null;
  accent: string;
}

function parseInput(body: unknown): { value: StudentCardInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  const studentId = String(b.studentId ?? "").trim();
  const className = String(b.className ?? "").trim();
  const schoolName = String(b.schoolName ?? "").trim();
  const academicYear = String(b.academicYear ?? "").trim();
  const accent = String(b.accent ?? "").trim();

  if (!name || !studentId || !className || !schoolName || !academicYear) {
    return {
      error: "name, studentId, className, schoolName and academicYear are required.",
    };
  }
  if (!ACCENTS.has(accent)) {
    return { error: "accent must be one of: indigo, teal, coral." };
  }

  return {
    value: {
      name,
      studentId,
      className,
      section: String(b.section ?? "").trim(),
      bloodGroup: String(b.bloodGroup ?? "").trim(),
      schoolName,
      academicYear,
      photoUrl: b.photoUrl == null ? null : String(b.photoUrl),
      accent,
    },
  };
}

router.use(requireAuth);

router.get("/students", async (req, res) => {
  await ready();
  const rows = await db
    .select()
    .from(studentCards)
    .where(eq(studentCards.userId, req.userId!))
    .orderBy(desc(studentCards.createdAt));
  return res.json(rows);
});

router.post("/students", async (req, res) => {
  await ready();
  const parsed = parseInput(req.body);
  if ("error" in parsed) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const [row] = await db
      .insert(studentCards)
      .values({ ...parsed.value, userId: req.userId! })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: "A student card with this ID already exists." });
    }
    throw err;
  }
});

router.patch("/students/:id", async (req, res) => {
  await ready();
  const parsed = parseInput(req.body);
  if ("error" in parsed) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const [row] = await db
      .update(studentCards)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(and(eq(studentCards.id, req.params.id), eq(studentCards.userId, req.userId!)))
      .returning();

    if (!row) {
      return res.status(404).json({ message: "Student card not found." });
    }
    return res.json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: "A student card with this ID already exists." });
    }
    throw err;
  }
});

router.delete("/students/:id", async (req, res) => {
  await ready();
  const [row] = await db
    .delete(studentCards)
    .where(and(eq(studentCards.id, req.params.id), eq(studentCards.userId, req.userId!)))
    .returning({ id: studentCards.id });

  if (!row) {
    return res.status(404).json({ message: "Student card not found." });
  }
  return res.status(204).send();
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export default router;
