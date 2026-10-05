import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  doublePrecision,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = {
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  avatarColor: varchar("avatar_color", { length: 16 }).notNull().default("indigo"),
  uiLocale: varchar("ui_locale", { length: 8 }).notNull().default("vi"),
  deletedAt: time("deleted_at"),
  samplesSeeded: boolean("samples_seeded").notNull().default(false),
  ...timestamps,
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: time("expires_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_idx").on(t.providerId, t.accountId),
  ],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const setSource = pgEnum("set_source", ["manual", "ai", "import"]);
export const cardStatus = pgEnum("card_status", ["new", "learning", "known"]);
export const gameKind = pgEnum("game_kind", ["match", "gravity", "memory", "scramble"]);
export const studySets = pgTable(
  "study_sets",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    termLang: varchar("term_lang", { length: 8 }).notNull(),
    definitionLang: varchar("definition_lang", { length: 8 }).notNull(),
    source: setSource("source").notNull().default("manual"),
    cardCount: integer("card_count").notNull(),
    deletedAt: time("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("sets_owner_updated_idx").on(t.ownerId, t.updatedAt, t.id),
    check("sets_card_count", sql`${t.cardCount} between 2 and 500`),
  ],
);
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey(),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    term: varchar("term", { length: 1000 }).notNull(),
    definition: varchar("definition", { length: 1000 }).notNull(),
    phonetic: varchar("phonetic", { length: 200 }),
    ...timestamps,
  },
  (t) => [index("cards_set_idx").on(t.setId)],
);
// Deferrable position uniqueness is added in SQL migration, so reordering is atomic.
export const cardProgress = pgTable(
  "card_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    status: cardStatus("status").notNull(),
    due: time("due").notNull().defaultNow(),
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0),
    lastReview: time("last_review"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index("progress_user_set_idx").on(t.userId, t.setId),
    index("progress_user_due_idx").on(t.userId, t.due),
  ],
);
export const testResults = pgTable(
  "test_results",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    config: jsonb("config"),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    durationMs: integer("duration_ms").notNull(),
    takenAt: time("taken_at").notNull().defaultNow(),
  },
  (t) => [
    index("tests_user_set_idx").on(t.userId, t.setId, t.takenAt),
    check(
      "test_score_valid",
      sql`${t.score} >= 0 and ${t.total} > 0 and ${t.score} <= ${t.total} and ${t.durationMs} >= 0`,
    ),
  ],
);
export const gameScores = pgTable(
  "game_scores",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    game: gameKind("game").notNull(),
    score: integer("score").notNull(),
    timeMs: integer("time_ms").notNull(),
    playedAt: time("played_at").notNull().defaultNow(),
  },
  (t) => [
    index("games_set_game_idx").on(t.setId, t.game, t.timeMs),
    check("game_score_valid", sql`${t.score} >= 0 and ${t.timeMs} >= 0`),
  ],
);
export const studyActivity = pgTable(
  "study_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    at: time("at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.setId] }),
    index("activity_user_at_idx").on(t.userId, t.at),
  ],
);
export const localImports = pgTable(
  "local_imports",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    localSetId: text("local_set_id").notNull(),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localSetId] })],
);

export const aiUploads = pgTable(
  "ai_uploads",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 120 }).notNull(),
    size: integer("size").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("uploads_expiry_idx").on(t.expiresAt)],
);
export const aiJobs = pgTable(
  "ai_generation_jobs",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    prompt: varchar("prompt", { length: 1000 }).notNull(),
    options: jsonb("options").notNull(),
    uploadIds: jsonb("upload_ids").notNull(),
    result: jsonb("result"),
    // Resumable progress so a job can advance across several short serverless invocations.
    state: jsonb("state"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: text("cost_usd").notNull().default("0"),
    errorCode: varchar("error_code", { length: 64 }),
    createdAt: time("created_at").notNull().defaultNow(),
    finishedAt: time("finished_at"),
    // Last time the browser drove this job; an active job without one recently is abandoned and
    // no longer holds a place in the shared provider queue.
    heartbeatAt: time("heartbeat_at"),
    // Only the step holding an unexpired lease may run and save this job, so a retried request
    // cannot race an invocation that is still running.
    stepLease: text("step_lease"),
    stepLeaseUntil: time("step_lease_until"),
  },
  (t) => [
    index("jobs_user_created_idx").on(t.userId, t.createdAt),
    index("jobs_status_id_idx").on(t.status, t.id),
  ],
);
export const aiAuxUsage = pgTable(
  "ai_aux_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: varchar("day", { length: 10 }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  newCardsPerDay: integer("new_cards_per_day").notNull().default(20),
  retention: doublePrecision("retention").notNull().default(0.9),
  timeZone: text("time_zone").notNull().default("Asia/Ho_Chi_Minh"),
  goalType: varchar("goal_type", { length: 12 }).notNull().default("cards"),
  goal: integer("goal").notNull().default(20),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderHour: integer("reminder_hour").notNull().default(19),
  reminderSentDay: varchar("reminder_sent_day", { length: 10 }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
});
export const cardStars = pgTable(
  "card_stars",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);
export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    mode: varchar("mode", { length: 24 }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    reviewedAt: time("reviewed_at").notNull().defaultNow(),
    wasNew: boolean("was_new").notNull().default(false),
    snapshot: jsonb("snapshot").notNull(),
  },
  (t) => [index("review_user_time_idx").on(t.userId, t.reviewedAt)],
);
export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    setId: uuid("set_id").references(() => studySets.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 24 }).notNull(),
    startedAt: time("started_at").notNull().defaultNow(),
    endedAt: time("ended_at"),
    cardsSeen: integer("cards_seen").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    incorrect: integer("incorrect").notNull().default(0),
    // Engaged time reported by the client (idle gaps capped); null on sessions recorded before it.
    activeSeconds: integer("active_seconds"),
  },
  (t) => [index("session_study_user_time_idx").on(t.userId, t.startedAt)],
);
export const streakFreezes = pgTable(
  "streak_freezes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: varchar("day", { length: 10 }).notNull(),
    week: varchar("week", { length: 10 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day] }),
    uniqueIndex("freeze_user_week_idx").on(t.userId, t.week),
  ],
);
export const cardImages = pgTable(
  "card_images",
  {
    id: uuid("id").primaryKey(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    alt: varchar("alt", { length: 1000 }).notNull(),
    size: integer("size").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("card_image_card_idx").on(t.cardId)],
);
