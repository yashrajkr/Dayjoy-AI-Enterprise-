/**
 * Voice AI Product Questions Tests
 * =================================
 *
 * Validates that the Dayjoy Voice AI assistant correctly handles product
 * inquiries from callers:
 *
 *   1. **Tool dispatch.** When a customer asks about a product, the AI
 *      calls `search_products` (or `search_knowledge`) tool.
 *   2. **Accurate info.** The spoken response includes accurate
 *      product information (name, price, ingredients, dosage).
 *   3. **WhatsApp follow-up.** The AI offers to send full product
 *      details via WhatsApp (rich-content channel).
 *   4. **Pricing queries.** "What's the price of X?" is handled as a
 *      product_inquiry intent and returns a price.
 *   5. **Recommendations.** Open-ended "what do you recommend?" queries
 *      produce a product recommendation.
 *   6. **Multi-product comparison.** "Compare X and Y" yields a
 *      side-by-side summary.
 *
 * Uses `createVoiceSimulator()` with a mocked `search_products` tool
 * that returns scripted product data.
 *
 * Reference: `vapi/flows/vapi-product-inquiry-flow.ts`,
 *            `vapi/tools/vapi-search-products-tool.ts`,
 *            `vapi/tools/vapi-search-knowledge-tool.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVoiceSimulator } from '../helpers/voice-simulator';

describe('Voice AI Product Questions', () => {
  let sim: ReturnType<typeof createVoiceSimulator>;

  beforeEach(() => {
    sim = createVoiceSimulator({
      tools: {
        search_products: vi.fn(async (args: { query: string }) => ({
          success: true,
          toolName: 'search_products',
          args,
          result: {
            products: [
              {
                id: 'p-1',
                name: 'Dayjoy Premium Health Tonic',
                price: 699,
                mrp: '₹699',
                ingredients: ['Ashwagandha', 'Shatavari', 'Amla', 'Giloy'],
                dosage: '15 ml twice daily after meals',
              },
            ],
            answer:
              'The Dayjoy Premium Health Tonic is ₹699 for 500 ml. ' +
              'It contains Ashwagandha, Shatavari, Amla, and Giloy. ' +
              'Recommended dosage is 15 ml twice daily after meals.',
          },
          speak:
            'The Dayjoy Premium Health Tonic is 699 rupees for 500 ml. ' +
            'It contains Ashwagandha, Shatavari, Amla, and Giloy. ' +
            'The recommended dosage is 15 ml twice daily after meals.',
        })),
        search_knowledge: vi.fn(async (args: { query: string }) => ({
          success: true,
          toolName: 'search_knowledge',
          args,
          result: {
            answer: 'Based on our knowledge base, the Beauty Cream is ₹599.',
          },
          speak: 'Based on our knowledge base, the Beauty Cream is 599 rupees.',
        })),
      },
    });
  });

  it('should call search_products when customer asks about a product', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Tell me about the Premium Health Tonic');

    expect(call.toolsCalled).toContain('search_products');
  });

  it('should provide accurate product information in the response', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance(
      'What is the dosage of the Premium Health Tonic?',
    );

    expect(turn.content).toMatch(/15\s*ml/i);
    expect(turn.content).toMatch(/twice daily|after meals/i);
  });

  it('should provide accurate pricing in the response', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance("What's the price of the Health Tonic?");

    expect(turn.content).toMatch(/699/i);
    expect(turn.content).toMatch(/rupees|₹|rs/i);
  });

  it('should provide accurate ingredient information', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance(
      'What are the ingredients in the Premium Health Tonic?',
    );

    expect(turn.content).toMatch(/Ashwagandha/i);
    expect(turn.content).toMatch(/Shatavari|Amla|Giloy/i);
  });

  it('should handle "how much" pricing questions', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('How much does the Health Tonic cost?');

    expect(turn.content).toMatch(/699/i);
  });

  it('should handle "what do you recommend" open-ended queries', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance(
      'Can you recommend a good wellness product?',
    );

    expect(turn.content).toMatch(/Health Tonic|wellness/i);
  });

  it('should offer to send details via WhatsApp', async () => {
    // Override the flow response for product_inquiry intent.
    const sim2 = createVoiceSimulator({
      tools: {
        search_products: vi.fn(async (args: { query: string }) => ({
          success: true,
          toolName: 'search_products',
          args,
          result: { answer: 'Health Tonic ₹699' },
          speak:
            'The Dayjoy Premium Health Tonic is 699 rupees for 500 ml. ' +
            'Would you like me to send the full details to your WhatsApp?',
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('Tell me about the Health Tonic');

    expect(turn.content).toMatch(/whatsapp/i);
  });

  it('should handle multi-product comparison queries', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        search_products: vi.fn(async (args: { query: string }) => ({
          success: true,
          toolName: 'search_products',
          args,
          result: {
            products: [
              { name: 'Health Tonic', price: 699 },
              { name: 'Omega-3 Supplement', price: 499 },
            ],
          },
          speak:
            "I'd recommend the Health Tonic for general wellness at 699 rupees, " +
            'or the Omega-3 supplement at 499 rupees if you want a focused supplement.',
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance(
      'Compare the Health Tonic and Omega-3 supplement',
    );

    expect(turn.content).toMatch(/Health Tonic/i);
    expect(turn.content).toMatch(/Omega-3/i);
    expect(turn.content).toMatch(/699/);
    expect(turn.content).toMatch(/499/);
  });

  it('should record toolName in the transcript when a tool is called', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Tell me about products');

    const toolTurn = call.transcript.find((t) => t.toolName === 'search_products');
    expect(toolTurn).toBeDefined();
    expect(toolTurn?.toolArgs).toBeDefined();
  });

  it('should provide a coherent answer when no product matches', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        search_products: vi.fn(async (args: { query: string }) => ({
          success: true,
          toolName: 'search_products',
          args,
          result: { products: [], answer: "I couldn't find a matching product." },
          speak:
            "I'm sorry, I couldn't find a product matching that description. Could you tell me more about what you're looking for?",
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('Do you sell quantum wellness drinks?');

    expect(turn.content).toMatch(/couldn't find|don't have|sorry/i);
  });

  it('should not call search_products for non-product queries', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Hi, how are you?');

    expect(call.toolsCalled).not.toContain('search_products');
  });

  it('should be able to handle multiple product questions in one call', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Tell me about the Health Tonic');
    await call.sendUtterance("What's the price of the same product?");

    expect(call.toolsCalled.filter((t) => t === 'search_products').length).toBeGreaterThanOrEqual(2);
  });
});
