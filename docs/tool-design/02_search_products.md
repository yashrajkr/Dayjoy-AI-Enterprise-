# Tool: `search_products`

> **Implementation:** `vapi/tools/vapi-search-products-tool.ts`
> **Spec version:** 1.0
> **Latency budget (p95):** 300 ms

## Purpose

Search the live Dayjoy product catalog by name, SKU, or keyword. Returns up to 10 matching products with their SKU, price, category, stock status, and a short description. This is the authoritative source for **live** product data — pricing, availability, and SKU-level information that the knowledge base (which is updated periodically) may lag behind.

The tool delegates to the backend `ProductsService.search()` method, which queries the Prisma `Product` table (joined with `Category` and `Inventory`) directly. No LLM is involved in the search itself — it's a pure database query — so the latency is low and the results are deterministic.

## When to Use

The LLM should call `search_products` when:

- The customer asks about a **specific product** by name ("Do you have an omega-3 supplement?").
- The customer asks about a **product category** ("What skincare products do you have?").
- The customer asks about **price** ("How much is the multivitamin?").
- The customer asks about **availability** ("Is the protein powder in stock?").
- The customer asks for a **recommendation** within a category ("What multivitamins do you recommend?").

`search_products` is often called **alongside** `search_knowledge` — `search_products` for the live price/stock, `search_knowledge` for detailed features/ingredients/usage.

## When NOT to Use

- The customer asks about a **policy** (returns, shipping) — use `search_knowledge`.
- The customer asks about the **compensation plan** — use `search_knowledge`.
- The customer asks about their **order status** — use `customer_lookup` (which returns order history).
- The customer asks about a **competitor's product** — decline and offer to transfer to sales.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Product name, category, or keyword to search for. Examples: `"multivitamin"`, `"omega-3"`, `"skincare"`. |
| `limit` | integer | No | Max products to return (default: 5, max: 10). |

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Product name, category, or keyword to search for. Examples: \"multivitamin\", \"omega-3\", \"skincare\"."
    },
    "limit": {
      "type": "integer",
      "description": "Max products to return (default: 5, max: 10).",
      "default": 5
    }
  },
  "required": ["query"]
}
```

## Response

### Success (multiple results)

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_abc123",
        "sku": "DJ-MV-001",
        "name": "Daily Multi",
        "slug": "daily-multi",
        "category": "Health Supplements",
        "price": 499,
        "currency": "INR",
        "shortDescription": "Comprehensive daily multivitamin with 22 vitamins and minerals.",
        "inStock": true,
        "quantity": 1240
      },
      {
        "id": "prod_def456",
        "sku": "DJ-MV-002",
        "name": "Women's Multi",
        "slug": "womens-multi",
        "category": "Health Supplements",
        "price": 549,
        "currency": "INR",
        "shortDescription": "Daily multivitamin formulated for women with iron, folic acid, and calcium.",
        "inStock": true,
        "quantity": 856
      },
      {
        "id": "prod_ghi789",
        "sku": "DJ-MV-003",
        "name": "Senior Multi",
        "slug": "senior-multi",
        "category": "Health Supplements",
        "price": 599,
        "currency": "INR",
        "shortDescription": "Multivitamin for adults over 50 with added joint support.",
        "inStock": false,
        "quantity": 0
      }
    ],
    "count": 3
  },
  "speak": "I found 3 products. First, Daily Multi for ₹499. Second, Women's Multi for ₹549. Third, Senior Multi for ₹599 (out of stock). Which one would you like to know more about?"
}
```

### Success (single result)

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_abc123",
        "sku": "DJ-MV-001",
        "name": "Daily Multi",
        "slug": "daily-multi",
        "category": "Health Supplements",
        "price": 499,
        "currency": "INR",
        "shortDescription": "Comprehensive daily multivitamin with 22 vitamins and minerals.",
        "inStock": true,
        "quantity": 1240
      }
    ],
    "count": 1
  },
  "speak": "I found 1 product: Daily Multi for ₹499. Would you like to know more about it?"
}
```

### Success (no results)

```json
{
  "success": true,
  "data": {
    "products": [],
    "count": 0
  },
  "speak": "I couldn't find any products matching \"acai berry\" in our catalog. Would you like me to transfer you to our sales team for help finding what you need?"
}
```

### Failure (catalogue service down)

```json
{
  "success": false,
  "error": "ProductsService.search() threw: Connection terminated unexpectedly",
  "speak": "I'm having trouble searching our product catalog right now. Could I transfer you to a sales agent?"
}
```

## Error Handling

| Condition | Behaviour |
|---|---|
| `query` is empty or whitespace | Return `success: false` + `speak` asking the customer to repeat the product name. |
| `context.tenantId` is missing | Return `success: false` + `error` (configuration error). |
| `limit` > 10 | Clamp to 10. |
| `limit` < 1 | Clamp to 1. |
| `ProductsService.search()` throws | Return `success: false` + `speak` apologising + offering to transfer. |
| 0 results returned | Return `success: true` with empty array + `speak` offering to transfer to sales. |

## Integration

The tool calls `ProductsService.search(query, limit, tenantId)` (`backend/products/products.service.ts`), which runs:

```sql
SELECT p.*, c.name AS category_name, i.quantity AS inventory_quantity
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN inventories i ON i.product_id = p.id
WHERE p.tenant_id = $1
  AND (p.name ILIKE '%' || $2 || '%'
       OR p.sku ILIKE '%' || $2 || '%'
       OR p.short_description ILIKE '%' || $2 || '%')
  AND p.is_active = true
ORDER BY p.name ASC
LIMIT $3;
```

The query is tenant-scoped (the `tenant_id` predicate is non-negotiable). The `is_active = true` filter hides discontinued products.

The `speak` field is formatted by the tool's `formatForVoice()` helper:

- **1 result:** `"I found 1 product: {name} for ₹{price}{stock}. Would you like to know more about it?"`
- **2-3 results:** `"I found {n} products. First, {name} for ₹{price}. Second, ... Which one would you like to know more about?"`
- **4+ results:** Same as 2-3 but truncated to top 3 + `"I also found {n} more matching products."`

The voice formatting deliberately uses ordinals ("First, Second, Third") rather than numbers ("1, 2, 3") because ordinals are easier to hear on a phone call.

## Latency + Cost

- **Latency budget (p95):** 300 ms (pure DB query, no LLM)
- **Cost per call:** ~$0 (no external API calls; only a Prisma query)

## Examples

### Example 1 — Successful multi-product search

**Customer:** "Do you have any multivitamins?"

**LLM call:** `search_products({ query: "multivitamin", limit: 5 })`

**Result:**
```json
{
  "success": true,
  "data": {
    "products": [
      { "name": "Daily Multi", "price": 499, "inStock": true },
      { "name": "Women's Multi", "price": 549, "inStock": true },
      { "name": "Senior Multi", "price": 599, "inStock": false }
    ],
    "count": 3
  },
  "speak": "I found 3 products. First, Daily Multi for ₹499. Second, Women's Multi for ₹549. Third, Senior Multi for ₹599 (out of stock). Which one would you like to know more about?"
}
```

**Sarah says:** "I found 3 products. First, Daily Multi for ₹499. Second, Women's Multi for ₹549. Third, Senior Multi for ₹599 — that one is currently out of stock. Which one would you like to know more about?"

### Example 2 — No results

**Customer:** "Do you have acai berry supplements?"

**LLM call:** `search_products({ query: "acai berry" })`

**Result:**
```json
{
  "success": true,
  "data": { "products": [], "count": 0 },
  "speak": "I couldn't find any products matching \"acai berry\" in our catalog. Would you like me to transfer you to our sales team for help finding what you need?"
}
```

**Sarah says:** "I couldn't find any products matching 'acai berry' in our catalog. Would you like me to transfer you to our sales team for help finding what you need?"

### Example 3 — Out-of-stock product

**Customer:** "Is the Senior Multi available?"

**LLM call:** `search_products({ query: "Senior Multi" })`

**Result:**
```json
{
  "success": true,
  "data": {
    "products": [
      { "name": "Senior Multi", "price": 599, "inStock": false, "quantity": 0 }
    ],
    "count": 1
  },
  "speak": "I found 1 product: Senior Multi for ₹599 (out of stock). Would you like to know more about it?"
}
```

**Sarah says:** "I found the Senior Multi for ₹599 — that one is currently out of stock. Would you like me to capture your information so we can notify you when it's back, or would you like to know about an alternative?"
