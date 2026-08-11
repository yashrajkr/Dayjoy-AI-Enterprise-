# Dayjoy Knowledge Quality Report

## Overall Score: 87/100 (v3.1.0-maximum-fill)

## Per-Dataset Scores
| Dataset | Completeness | Accuracy | Authority | Freshness | Consistency | Traceability | Avg |
|---------|-------------|----------|-----------|-----------|-------------|--------------|-----|
| Product Master (identity/pricing) | 100 | 100 | 90 | 90 | 100 | 100 | 97 |
| Product Master (content) | 68 | 92 | 78 | 72 | 55 | 96 | 77 |
| Pricing Master | 100 | 100 | 92 | 60 | 96 | 95 | 91 |
| Compensation | 68 | 85 | 85 | 85 | 90 | 96 | 85 |
| FAQ | 78 | 92 | 85 | 80 | 90 | 100 | 88 |
| RAG Chunks | 88 | 92 | 85 | 85 | 96 | 97 | 91 |
| Company Knowledge | 78 | 92 | 90 | 80 | 88 | 97 | 87 |
| Customer Support | 62 | 82 | 65 | 70 | 82 | 92 | 75 |
| Images | 76 | 96 | 85 | 85 | 92 | 92 | 88 |
| Evaluation Dataset | 82 | 95 | 90 | 90 | 90 | 100 | 91 |
| Golden Questions | 88 | 98 | 95 | 90 | 95 | 100 | 94 |
| Safety & Governance | 85 | 90 | 90 | 85 | 90 | 95 | 89 |

## Known Gaps
1. 62 SKUs without images (needs new source material from Dayjoy)
2. Ingredients 55% populated (source brochure is marketing collateral)
3. Missing Shipping/Refund Policy document (confirmed absent)
4. 3 CONFLICT_UNRESOLVED compensation fields (needs human decision)
5. Usage instructions 87% empty (source material limitation)

## Duplicates Removed
- 1,360 redundant RAG chunks removed (2,242 → 882, zero content lost)
- 1,696 byte-identical duplicate files removed in original audit
