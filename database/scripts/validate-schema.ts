/**
 * Database Schema Validation Script
 * =====================================================================
 * Purpose: Verify the Prisma schema at `database/prisma/schema.prisma`
 *          is consistent with the SQL migrations under
 *          `database/migrations/` and follows platform conventions.
 *
 * Checks performed:
 *   1. Every `model` has a `@@map("snake_case_table")` annotation.
 *   2. Every camelCase scalar/enum field has a `@map("snake_case")`
 *      annotation so it matches the snake_case SQL columns.
 *   3. Every camelCase scalar field whose snake_case form differs from
 *      its declared `@map("...")` value is flagged.
 *   4. Foreign-key fields (names ending in `Id`, like `tenantId`)
 *      should have a corresponding `@@index` entry. Missing indexes
 *      are reported (not enforced).
 *   5. Critical tables referenced in audit triggers (migration 014)
 *      should exist in the schema as models.
 *
 * Usage:
 *   npx tsx database/scripts/validate-schema.ts
 *   npx tsx database/scripts/validate-schema.ts --schema=path/to/schema.prisma
 *
 * Exit code:
 *   0 — No fatal issues found (warnings allowed)
 *   1 — One or more fatal issues found
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldInfo {
  /** Field name as declared in the schema (camelCase). */
  name: string;
  /** Prisma type token, e.g. `String`, `DateTime?`, `User[]`. */
  type: string;
  /** True if the line contains an `@relation(...)` attribute. */
  isRelation: boolean;
  /** True if the type ends with `[]` (array). */
  isArray: boolean;
  /** True if the type ends with `?` (optional). */
  isOptional: boolean;
  /** The `@map("...")` value if present, else null. */
  mapValue: string | null;
  /** True if the line contains `@id`. */
  isId: boolean;
  /** Raw line text (trimmed) for error reporting. */
  raw: string;
  /** Line number (1-based). */
  lineNo: number;
}

interface ModelInfo {
  name: string;
  tableName: string | null; // @@map value
  fields: FieldInfo[];
  /** Composite index declarations, e.g. `@@index([tenantId, status])`. */
  indexes: string[][];
  /** Composite unique declarations. */
  uniques: string[][];
  /** Line number where the `model X {` declaration starts. */
  startLine: number;
}

interface Issue {
  severity: 'fatal' | 'warning' | 'info';
  model?: string;
  field?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set([
  'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json',
  'Bytes', 'Decimal', 'BigInt',
]);

/**
 * Tables that are audited by `trg_audit_*` triggers in migration 014
 * and `database/triggers/business_triggers.sql`. Each should exist as
 * a model in the Prisma schema.
 */
const AUDITED_TABLES = new Set([
  'users', 'customers', 'orders', 'products', 'distributors', 'leads',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelToSnake(name: string): string {
  return name
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function isCamelCase(name: string): boolean {
  return name !== name.toLowerCase() && /^[a-z][a-zA-Z0-9]*$/.test(name);
}

function baseTypeOf(type: string): string {
  return type.replace(/[?\[\]]+$/, '');
}

/**
 * Strip inline `// ...` comments while preserving string literals.
 */
function stripInlineComment(line: string): string {
  let inString = false;
  let quoteChar: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === quoteChar) inString = false;
    } else if (c === '"' || c === "'") {
      inString = true;
      quoteChar = c as '"' | "'";
    } else if (c === '/' && line[i + 1] === '/') {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseSchema(content: string): ModelInfo[] {
  const lines = content.split('\n');
  const models: ModelInfo[] = [];
  let current: ModelInfo | null = null;
  let braceDepth = 0;

  const modelStartRe = /^model\s+(\w+)\s*\{/;
  const enumStartRe = /^enum\s+(\w+)\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();

    // Skip empty / comment lines
    if (!stripped || stripped.startsWith('//')) continue;

    if (current === null) {
      // Look for model start
      const m = stripped.match(modelStartRe);
      if (m) {
        current = {
          name: m[1],
          tableName: null,
          fields: [],
          indexes: [],
          uniques: [],
          startLine: i + 1,
        };
        braceDepth = 1;
        continue;
      }
      // Skip enum blocks (we don't validate them here)
      const e = stripped.match(enumStartRe);
      if (e) {
        current = null;
        braceDepth = 1; // Not tracked for enums since we skip
        // Mark we're in an enum so we don't parse its lines as fields.
        // We use a sentinel: push a fake "enum" model with name `__enum__`.
        current = {
          name: `__enum__${e[1]}`,
          tableName: null,
          fields: [],
          indexes: [],
          uniques: [],
          startLine: i + 1,
        };
        continue;
      }
      continue;
    }

    // Closing brace
    if (stripped === '}') {
      if (current.name.startsWith('__enum__')) {
        // Don't keep enums in the models list
        current = null;
        braceDepth = 0;
        continue;
      }
      models.push(current);
      current = null;
      braceDepth = 0;
      continue;
    }

    // Block-level attributes
    if (stripped.startsWith('@@')) {
      const tableMap = stripped.match(/^@@map\("([^"]+)"\)/);
      if (tableMap) {
        current.tableName = tableMap[1];
        continue;
      }
      const idx = stripped.match(/^@@index\(\[([^\]]+)\]\)/);
      if (idx) {
        const fields = idx[1].split(',').map((s) => s.trim());
        current.indexes.push(fields);
        continue;
      }
      const uniq = stripped.match(/^@@unique\(\[([^\]]+)\]\)/);
      if (uniq) {
        const fields = uniq[1].split(',').map((s) => s.trim());
        current.uniques.push(fields);
        continue;
      }
      // Other @@id etc — ignore
      continue;
    }

    // Field declaration
    const codePart = stripInlineComment(raw);
    const fieldMatch = codePart.match(/^\s+(\w+)\s+(\S+)(.*)$/);
    if (!fieldMatch) continue;

    const [, fieldName, fieldType, rest] = fieldMatch;
    const isRelation = rest.includes('@relation') || codePart.includes('@relation');
    const isArray = fieldType.endsWith('[]');
    const isOptional = fieldType.endsWith('?');
    const isId = rest.includes('@id') || codePart.includes('@id');
    const mapMatch = rest.match(/@map\("([^"]+)"\)/);
    const mapValue = mapMatch ? mapMatch[1] : null;

    // Skip 1-N relation arrays whose type is not a scalar
    if (isArray && !SCALAR_TYPES.has(baseTypeOf(fieldType))) {
      continue;
    }

    current.fields.push({
      name: fieldName,
      type: fieldType,
      isRelation,
      isArray,
      isOptional,
      mapValue,
      isId,
      raw: codePart.trim(),
      lineNo: i + 1,
    });
  }

  return models;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkModelMap(models: ModelInfo[], issues: Issue[]): void {
  for (const m of models) {
    if (!m.tableName) {
      issues.push({
        severity: 'fatal',
        model: m.name,
        message: `Model '${m.name}' is missing @@map("snake_case_table").`,
      });
    }
  }
}

function checkFieldMaps(models: ModelInfo[], issues: Issue[]): void {
  for (const m of models) {
    for (const f of m.fields) {
      // Skip relations (they're not columns)
      if (f.isRelation) continue;

      // Skip fields that are all-lowercase (no @map needed)
      if (!isCamelCase(f.name)) continue;

      if (!f.mapValue) {
        issues.push({
          severity: 'fatal',
          model: m.name,
          field: f.name,
          message: `Field '${m.name}.${f.name}' is camelCase but missing @map("...") (line ${f.lineNo}).`,
        });
        continue;
      }

      // Verify the @map value matches the expected snake_case form
      const expected = camelToSnake(f.name);
      if (f.mapValue !== expected) {
        issues.push({
          severity: 'warning',
          model: m.name,
          field: f.name,
          message:
            `Field '${m.name}.${f.name}' has @map("${f.mapValue}") but ` +
            `expected @map("${expected}") based on camelCase convention.`,
        });
      }
    }
  }
}

function checkForeignKeyIndexes(models: ModelInfo[], issues: Issue[]): void {
  for (const m of models) {
    // Collect all fields that look like foreign keys (camelCase ending in `Id`)
    const fkFields = m.fields.filter(
      (f) => !f.isRelation && /^.+Id$/.test(f.name) && f.name !== 'id',
    );

    for (const fk of fkFields) {
      // Check if this field appears in any @@index or @@unique
      const inIndex = m.indexes.some((idx) => idx.includes(fk.name));
      const inUnique = m.uniques.some((u) => u.includes(fk.name));
      const isUnique = fk.raw.includes('@unique');

      if (!inIndex && !inUnique && !isUnique) {
        issues.push({
          severity: 'warning',
          model: m.name,
          field: fk.name,
          message:
            `Foreign-key field '${m.name}.${fk.name}' is not covered by ` +
            `any @@index or @@unique. Consider adding an index for query performance.`,
        });
      }
    }
  }
}

function checkAuditedTablesExist(models: ModelInfo[], issues: Issue[]): void {
  const tableNames = new Set(models.map((m) => m.tableName).filter(Boolean) as string[]);
  for (const table of AUDITED_TABLES) {
    if (!tableNames.has(table)) {
      issues.push({
        severity: 'fatal',
        message:
          `Audited table '${table}' (referenced by migration 014 audit triggers) ` +
          `does not have a corresponding model in the Prisma schema.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { schemaPath: string } {
  const args = argv.slice(2);
  let schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  for (const a of args) {
    const m = a.match(/^--schema=(.+)$/);
    if (m) schemaPath = path.resolve(m[1]);
  }
  return { schemaPath };
}

function colorize(severity: Issue['severity']): string {
  switch (severity) {
    case 'fatal': return '\x1b[31m';   // red
    case 'warning': return '\x1b[33m'; // yellow
    case 'info': return '\x1b[36m';    // cyan
    default: return '';
  }
}

const RESET = '\x1b[0m';

function main(): void {
  const { schemaPath } = parseArgs(process.argv);

  if (!fs.existsSync(schemaPath)) {
    console.error(`\x1b[31m✗ Schema file not found: ${schemaPath}${RESET}`);
    process.exit(1);
  }

  console.log(`\n📋 Validating Prisma schema: ${schemaPath}\n`);

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const models = parseSchema(content);

  console.log(`   Parsed ${models.length} models.\n`);

  const issues: Issue[] = [];

  // 1. Verify all models have @@map
  console.log('1️⃣  Checking @@map on every model...');
  checkModelMap(models, issues);

  // 2. Verify all camelCase fields have @map
  console.log('2️⃣  Checking @map on every camelCase field...');
  checkFieldMaps(models, issues);

  // 3. Check for missing FK indexes
  console.log('3️⃣  Checking foreign-key indexes...');
  checkForeignKeyIndexes(models, issues);

  // 4. Check that audited tables exist as models
  console.log('4️⃣  Checking that audited tables are modelled...');
  checkAuditedTablesExist(models, issues);

  // ----- Print results -----
  const fatals = issues.filter((i) => i.severity === 'fatal');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  console.log('');
  if (issues.length === 0) {
    console.log('✅ All checks passed — no issues found.\n');
    process.exit(0);
  }

  // Group issues by severity for cleaner output
  const printIssues = (label: string, list: Issue[]) => {
    if (list.length === 0) return;
    console.log(`${colorize(list[0].severity)}── ${label} (${list.length}) ──${RESET}`);
    for (const i of list) {
      const loc = i.model
        ? `  [${i.model}${i.field ? `.${i.field}` : ''}]`
        : '  [schema]';
      console.log(`${colorize(i.severity)}•${RESET} ${loc} ${i.message}`);
    }
    console.log('');
  };

  printIssues('FATAL', fatals);
  printIssues('WARNING', warnings);
  printIssues('INFO', infos);

  // ----- Summary -----
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Fatal:   ${fatals.length}`);
  console.log(`  Warning: ${warnings.length}`);
  console.log(`  Info:    ${infos.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (fatals.length > 0) {
    console.log(`\n\x1b[31m✗ ${fatals.length} fatal issue(s) must be fixed.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32m✓ No fatal issues. Review warnings above.${RESET}\n`);
    process.exit(0);
  }
}

main();
