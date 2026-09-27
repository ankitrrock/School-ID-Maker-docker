import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One settings row per user (the school profile shown on every generated card).
export const schoolSettings = pgTable("school_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  schoolName: text("school_name").notNull().default("Northstar Academy"),
  tagline: text("tagline").notNull().default("Learn. Lead. Belong."),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  defaultAccent: text("default_accent").notNull().default("indigo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Student ID cards, scoped to the staff account that created them.
export const studentCards = pgTable("student_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  studentId: text("student_id").notNull(),
  className: text("class_name").notNull(),
  section: text("section").notNull().default(""),
  bloodGroup: text("blood_group").notNull().default(""),
  schoolName: text("school_name").notNull(),
  academicYear: text("academic_year").notNull(),
  photoUrl: text("photo_url"),
  accent: text("accent").notNull().default("indigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type SchoolSettingsRow = typeof schoolSettings.$inferSelect;
export type StudentCardRow = typeof studentCards.$inferSelect;
