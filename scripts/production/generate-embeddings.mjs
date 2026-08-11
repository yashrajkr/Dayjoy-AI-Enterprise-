#!/usr/bin/env node
/**
 * generate-embeddings.mjs
 * Generates OpenAI embeddings for all RAG chunks where embedding IS NULL.
 * Uses text-embedding-3-small (1536 dimensions).
 * Batches 100 chunks per API call with 100ms delay between batches.
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is not set in .env");
  process.exit(1);
}

console.log("▸ Dayjoy AI — Embedding Generation");
console.log(`  Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
console.log(`  OpenAI Key: ${OPENAI_API_KEY.slice(0, 10)}...`);
console.log("");

// We use dynamic import for pg since it may not be installed yet
async function main() {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("❌ 'pg' module not found. Install with: pnpm add pg");
    console.error("  Or run via Docker: docker exec dayjoy-postgres psql -c '...'");
    process.exit(1);
  }

  const { Pool } = pg.default || pg;
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Count chunks without embeddings
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

  let processed = 0;
  const batchSize = 100;
  let errorCount = 0;

  while (processed < total) {
    // Get next batch
    const batch = await pool.query(
      `SELECT id, content FROM rag_chunks
       WHERE embedding IS NULL AND status = 'READY'
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize]
    );

    if (batch.rows.length === 0) break;

    // Call OpenAI Embeddings API
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: batch.rows.map((r) => r.content.slice(0, 8000)),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API ${response.status}: ${errText}`);
      }

      const data = await response.json();

      // Update each chunk with its embedding
      for (let i = 0; i < batch.rows.length; i++) {
        const chunkId = batch.rows[i].id;
        const embedding = JSON.stringify(data.data[i].embedding);
        await pool.query(
          `UPDATE rag_chunks SET embedding = $1::vector WHERE id = $2`,
          [embedding, chunkId]
        );
      }

      processed += batch.rows.length;
      console.log(`  Processed ${processed}/${total} chunks (${Math.round((processed / total) * 100)}%)`);

      // Rate limit: 100ms delay
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      errorCount++;
      console.error(`  ❌ Batch failed: ${err.message}`);

      if (errorCount >= 5) {
        console.error("❌ Too many errors (5). Aborting.");
        break;
      }

      // Wait 2s before retry
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("");
  console.log(`✅ Embedding generation complete: ${processed}/${total} chunks processed`);

  // Verify
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
