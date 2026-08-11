/**
 * Barrel for the shared exception filters.
 *
 * The global {@link AllExceptionsFilter} handles every exception type,
 * including Prisma errors. The standalone {@link PrismaExceptionFilter}
 * is exported for opt-in per-controller usage and for unit testing.
 *
 * `mapPrismaErrorToHttp` is exported so unit tests can assert the
 * Prisma-code → HTTP mapping without instantiating a full Nest context.
 */
export { AllExceptionsFilter } from './all-exceptions.filter';
export {
  PrismaExceptionFilter,
  mapPrismaErrorToHttp,
} from './prisma-exception.filter';
