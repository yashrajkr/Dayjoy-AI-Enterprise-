# Dayjoy RAG Validation Report

## Test Methodology
- 169 golden questions from packages/knowledge-base/dayjoy-kb/qa/test_questions/dayjoy_golden_questions.csv
- 1,060 evaluation test cases from qa/evaluation/evaluation_dataset.csv
- 94 adversarial test cases (must_abstain=true)
- 4 access-control tests (public vs distributor-only queries)
- 3 abstain-policy tests (CONFLICT_UNRESOLVED fields)

## Expected Results (after runtime execution)
- Product pricing queries: >95% accuracy (verified pricing data)
- Product identity queries: >95% accuracy (170/170 products)
- FAQ queries: >90% accuracy (2,209 Q&A pairs)
- Compensation queries: 100% abstain rate on 3 conflict fields
- Health/dosage queries: 100% disclaimer append rate
- Access control: 0% leak rate (distributor-only chunks not returned for public)

## Runtime Test Required
This validation requires:
1. Database running with migrations 022-024 applied
2. Embeddings generated (generate-embeddings.sh)
3. Backend running with OpenAI API key
4. Run: ./scripts/production/test-retrieval.mjs

## Status: NOT VERIFIABLE FROM STATIC FILES — RUNTIME TEST REQUIRED
