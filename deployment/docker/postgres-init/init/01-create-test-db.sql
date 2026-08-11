-- Docker entrypoint script for PostgreSQL
-- Runs on first container start only
-- Creates the test database for pytest

CREATE DATABASE dayjoyai_test;
GRANT ALL PRIVILEGES ON DATABASE dayjoyai_test TO dayjoy;
