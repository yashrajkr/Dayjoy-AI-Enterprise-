/**
 * Re-export shim — canonical source lives in `packages/shared/`.
 *
 * This file previously held a byte-identical copy of
 * `packages/shared/utils/validation.ts` (audit: triplicated shared code).
 * It now re-exports the canonical version so any existing import path
 * (`shared/utils/validation`) keeps working, with a single source of truth.
 */
export * from '../../packages/shared/utils/validation';
