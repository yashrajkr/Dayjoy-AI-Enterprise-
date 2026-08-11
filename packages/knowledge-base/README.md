# @dayjoy/knowledge-base

Source documents for RAG ingestion. These files are chunked and embedded
by the RAG pipeline (see `/rag/`).

## Folders

- `products/` — Product catalogs, brochures, spec sheets
- `policies/` — Company policies (refund, return, privacy, shipping)
- `compensation-plan/` — Distributor compensation plan documents
- `faqs/` — Frequently asked questions
- `training-material/` — Distributor training modules
- `sops/` — Standard operating procedures

## Format

Documents can be: `.md`, `.txt`, `.pdf`, `.docx`, `.csv`, `.json`, `.html`.

## Adding Documents

1. Drop files into the appropriate folder.
2. Run the RAG ingestion pipeline:
   ```bash
   tsx rag/ingestion/chunking-service.ts
   tsx rag/embeddings/embeddings-pipeline.ts
   ```
3. Verify in the database: `SELECT count(*) FROM rag_chunks;`
