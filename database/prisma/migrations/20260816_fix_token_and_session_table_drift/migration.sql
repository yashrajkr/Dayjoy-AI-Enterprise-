-- Fixes three more instances of the DB predating `prisma migrate` (see
-- 20260816_add_enum_types/migration.sql for the full context): table/column
-- names that don't match what schema.prisma expects. All three tables were
-- empty at the time of this migration — pure renames, zero data loss.

-- EmailVerificationToken.token / PasswordResetToken.token (both `String
-- @unique`, no @map) expect a column literally named `token`; the DB had
-- `token_hash` instead.
ALTER TABLE email_verification_tokens RENAME COLUMN token_hash TO token;
ALTER TABLE password_reset_tokens RENAME COLUMN token_hash TO token;

-- UserSession (@@map("user_sessions")) expects table `user_sessions`; the
-- DB had it as `sessions` (same columns Prisma needs, plus a few extra ones
-- Prisma doesn't manage).
ALTER TABLE sessions RENAME TO user_sessions;

-- UserSession.ipAddress is a plain `String?`, but the actual column was
-- typed `inet` — Prisma's query engine can't reconcile that with the
-- Rust-side String type it expects (P2023 "inconsistent column data") on
-- every insert/read.
ALTER TABLE user_sessions ALTER COLUMN ip_address TYPE varchar(45) USING ip_address::text;
