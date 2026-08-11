import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ProductsService } from '../../backend/products/products.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiSearchProductsTool — search the live product catalog via the real
 * `ProductsService.search()` method.
 *
 * Returns the top 5 matching products (name, SKU, price, category,
 * short description, stock status) plus a natural-language `speak`
 * field the assistant reads aloud.
 *
 * The `speak` field is formatted as a numbered list ("First, X for ₹Y.
 * Second, ...") so the customer can easily refer to a product by its
 * position. When no products match, `speak` offers to transfer to sales.
 */
@Injectable()
export class VapiSearchProductsTool implements VapiTool {
  name = 'search_products';
  description =
    'Search the Dayjoy product catalog by name, SKU, or description. ' +
    'Returns up to 5 matching products with price, category, and stock ' +
    'status. Use this when the customer asks about a specific product ' +
    'or product category.';

  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Product name, category, or keyword to search for. ' +
          'Examples: "multivitamin", "omega-3", "skincare".',
      },
      limit: {
        type: 'integer',
        description: 'Max products to return (default: 5, max: 10).',
        default: 5,
      },
    },
    required: ['query'],
  };

  private readonly logger = new Logger(VapiSearchProductsTool.name);

  constructor(
    @Inject(forwardRef(() => ProductsService))
    private readonly productsService: ProductsService,
  ) {}

  async execute(
    args: { query: string; limit?: number },
    context: ToolContext,
  ): Promise<ToolResult> {
    const query = (args?.query ?? '').toString().trim();
    if (!query) {
      return {
        success: false,
        error: 'Query is required',
        speak:
          "I didn't catch the product name. Could you repeat which product you're interested in?",
      };
    }

    const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);

    try {
      this.logger.log(
        `search_products(query="${query}", limit=${limit}, tenant=${context.tenantId ?? '-'})`,
      );

      const products = await this.productsService.search(
        query,
        limit,
        context.tenantId,
      );

      if (!products || products.length === 0) {
        return {
          success: true,
          data: { products: [], count: 0 },
          speak: `I couldn't find any products matching "${query}" in our catalog. Would you like me to transfer you to our sales team for help finding what you need?`,
        };
      }

      const formatted = products.map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        category: p.category?.name ?? null,
        price: Number(p.price),
        currency: p.currency ?? 'INR',
        shortDescription: p.shortDescription ?? null,
        inStock: p.inventory ? p.inventory.quantity > 0 : true,
        quantity: p.inventory?.quantity ?? null,
      }));

      return {
        success: true,
        data: { products: formatted, count: formatted.length },
        speak: this.formatForVoice(formatted),
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`search_products failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I'm having trouble searching our product catalog right now. Could I transfer you to a sales agent?",
      };
    }
  }

  /**
   * Build the spoken summary. Examples:
   *   1 result:  "I found 1 product: Multivitamin for ₹499. ..."
   *   3 results: "I found 3 products. First, Multivitamin for ₹499.
   *              Second, Omega-3 for ₹399. Third, Protein for ₹999."
   *   5+ results: same as 3 but truncated to 3 + "I also found N more."
   */
  private formatForVoice(products: any[]): string {
    const currencyLabel = (p: any) =>
      p.currency === 'INR' || p.currency === 'USD' ? '₹' : '';
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

    if (products.length === 1) {
      const p = products[0];
      const stock = p.inStock ? '' : ' (currently out of stock)';
      return `I found 1 product: ${p.name} for ${currencyLabel(p)}${p.price}${stock}. Would you like to know more about it?`;
    }

    const head = products.slice(0, 3);
    const tail = products.length - head.length;
    const parts = head.map((p, i) => {
      const stock = p.inStock ? '' : ' (out of stock)';
      return `${ordinals[i]}, ${p.name} for ${currencyLabel(p)}${p.price}${stock}`;
    });
    const more = tail > 0 ? ` I also found ${tail} more matching product${tail === 1 ? '' : 's'}.` : '';
    return `I found ${products.length} products. ${parts.join('. ')}.${more} Which one would you like to know more about?`;
  }
}
