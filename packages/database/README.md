# @dayjoy/database

Prisma database package. See `/database/` at repo root for the actual schema,
migrations, and seed. This package re-exports the generated Prisma client.

## Usage

```typescript
import { PrismaClient } from '@dayjoy/database';
const prisma = new PrismaClient();
```
