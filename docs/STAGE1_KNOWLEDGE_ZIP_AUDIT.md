# STAGE 1 — KNOWLEDGE ZIP AUDIT

**Date:** 2026-08-10
**Status:** Audit complete

## Summary
- 4 KB ZIPs analyzed (KB1: 350 files, KB2: 327 files, KB3: 14 files, KB4: 7 files)
- 170 products with 46 fields each
- 2,209 FAQs across 170 product-specific files
- 882 canonical RAG chunks (deduplicated from 2,242)
- 127 product images with full metadata
- 81 compensation rules (48 VERIFIED, 30 UNVERIFIED, 3 CONFLICT_UNRESOLVED)
- 169 golden test questions
- 1,060 evaluation test cases
- KB quality score: 87/100 (v3.1.0-maximum-fill)

## 3 Unresolved Conflicts
1. Retail Profit rate: 30-50% (old CSV) vs Up to 100% (PDF)
2. Mentorship Bonus rate: 100% of binary (old CSV) vs 50% of BMI (PDF)
3. Business Matching structure: Flat Rs 500/pair daily (old CSV) vs Tiered weekly (PDF)

All 3 are marked CONFLICT_UNRESOLVED — the AI abstains and routes to human review.
