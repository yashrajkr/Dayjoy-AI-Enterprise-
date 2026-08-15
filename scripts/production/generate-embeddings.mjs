#!/usr/bin/env node
/**
 * generate-embeddings.mjs
 * Generates Gemini embeddings for all RAG chunks where embedding IS NULL.
 * Uses gemini-embedding-001 requested at 1536 dimensions — the same
 * model/endpoint/dimension combination backend/knowledge/knowledge.service.ts
 * uses for query-time embeddings, and the one all 882 canonical rag_chunks
 * were originally embedded with. Do not switch this back to OpenAI: the
 * stored vectors and query vectors must come from the same model to be
 * comparable via pgvector's cosine distance.
 * One chunk per request (Gemini's embedContent API is single-content), with
 * a rate-limit delay and exponential-backoff retry on HTTP 429. Resumable —
 * only chunks with embedding IS NULL are selected, so re-running is safe.
 */

import { readFileSync } from "fs";

// Load .env
try {
  const env = readFileSync(".env", "utf-8");
  for (const line of env.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";
const DIMENSIONS = 1536;
const DELAY_MS = 1100;
const MAX_RETRIES = 5;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

console.log("▸ Dayjoy AI — Embedding Generation (Gemini)");
console.log(`  Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
console.log(`  Model: ${MODEL} (${DIMENSIONS} dims)`);
console.log("");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedText(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text: text.slice(0, 8000) }] },
    outputDimensionality: DIMENSIONS,
  };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const values = json.embedding?.values;
      if (!values || values.length !== DIMENSIONS) {
        throw new Error(`Unexpected embedding shape: ${values ? values.length : "none"}`);
      }
      return values;
    }
    if (res.status === 429) {
      const backoff = Math.min(60000, 5000 * attempt);
      console.log(`  ⏳ Rate limited, attempt ${attempt}/${MAX_RETRIES}, backing off ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }
  throw new Error("RATE_LIMIT_EXHAUSTED");
}

async function main() {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("❌ 'pg' module not found. Install with: pnpm add pg");
    process.exit(1);
  }

  const { Pool } = pg.default || pg;
  const pool = new Pool({ connectionString: DATABASE_URL });

  const { rows } = await pool.query(
    "SELECT COUNT(*) as count FROM rag_chunks WHERE embedding IS NULL AND status = 'READY'"
  );
  const total = parseInt(rows[0].count);
  console.log(`▸ Found ${total} chunks without embeddings`);

  if (total === 0) {
    console.log("✅ All chunks already have embeddings");
    await pool.end();
    return;
  }

  const pending = await pool.query(
    `SELECT id, content FROM rag_chunks WHERE embedding IS NULL AND status = 'READY' ORDER BY created_at ASC`
  );

  let done = 0;
  let failed = 0;
  let quotaStopped = false;

  for (const row of pending.rows) {
    try {
      const vec = await embedText(row.content);
      const literal = "[" + vec.join(",") + "]";
      await pool.query(`UPDATE rag_chunks SET embedding = $1::vector WHERE id = $2`, [literal, row.id]);
      done++;
      if (done % 25 === 0) {
        console.log(`  Processed ${done}/${total} chunks (${Math.round((done / total) * 100)}%)`);
      }
      await sleep(DELAY_MS);
    } catch (err) {
      if (err.message === "RATE_LIMIT_EXHAUSTED" || /quota|RESOURCE_EXHAUSTED/i.test(err.message)) {
        console.log(`  ❌ Quota exhausted — stopping. Last chunk: ${row.id}`);
        quotaStopped = true;
        break;
      }
      failed++;
      console.error(`  ❌ Chunk ${row.id} failed: ${err.message}`);
    }
  }

  console.log("");
  console.log(`✅ Embedding generation complete: ${done}/${total} chunks processed (${failed} failed, quota_stopped=${quotaStopped})`);

  const { rows: verifyRows } = await pool.query(
    "SELECT COUNT(*) as total, COUNT(embedding) as embedded FROM rag_chunks WHERE status = 'READY'"
  );
  console.log(`  Total READY chunks: ${verifyRows[0].total}`);
  console.log(`  Chunks with embeddings: ${verifyRows[0].embedded}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
