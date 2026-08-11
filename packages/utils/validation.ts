/**
 * Re-export shim — canonical source lives in `packages/shared/`.
 *
 * Previously a byte-identical copy of `packages/shared/utils/validation.ts`.
 * Kept so consumers importing from `@dayjoy/utils` (or `packages/utils/`)
 * keep working with a single source of truth.
 */
export * from '../shared/utils/validation';
