import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiAssistantService } from './vapi-assistant.service';
import { VapiClientService } from '../config/vapi-client-service';
import { VapiToolRegistry } from '../tools/vapi-tool-registry.service';
import { buildDefaultSystemPrompt } from '../prompts';
import { CreateAssistantDto, UpdateAssistantDto } from './create-assistant.dto';

/**
 * Build a stub `VapiClientService`. `isEnabled()` returns false by
 * default so `createAssistant` / `updateAssistant` / `deleteAssistant`
 * are skipped — the DB row is still created in this mode (which is the
 * degraded-mode behaviour the real service implements).
 */
function createMockVapiClient(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? false;
  return {
    isEnabled: vi.fn(() => enabled),
    createAssistant: vi.fn(),
    getAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
    listAssistants: vi.fn(),
  } as unknown as VapiClientService;
}

/**
 * Build a stub `VapiToolRegistry` — only the methods the
 * `VapiAssistantService` calls are mocked.
 */
function createMockToolRegistry() {
  const toolDefs = [
    { type: 'function' as const, function: { name: 'search_knowledge', description: 'search kb', parameters: { type: 'object' } } },
    { type: 'function' as const, function: { name: 'search_products', description: 'search catalog', parameters: { type: 'object' } } },
  ];
  return {
    listTools: vi.fn(() => [
      { name: 'search_knowledge', description: 'search kb', parameters: {}, execute: vi.fn() },
      { name: 'search_products', description: 'search catalog', parameters: {}, execute: vi.fn() },
    ]),
    getToolDefinitions: vi.fn(() => toolDefs),
  } as unknown as VapiToolRegistry;
}

describe('VapiAssistantService', () => {
  let prisma: any;
  let vapiClient: VapiClientService;
  let toolRegistry: VapiToolRegistry;
  let service: VapiAssistantService;

  const user = { userId: 'u1', tenantId: 't1', email: 'a@b.com' };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    vapiClient = createMockVapiClient({ enabled: false });
    toolRegistry = createMockToolRegistry();

    const moduleRef = await Test.createTestingModule({
      providers: [
        VapiAssistantService,
        { provide: PrismaService, useValue: prisma },
        { provide: VapiClientService, useValue: vapiClient },
        { provide: VapiToolRegistry, useValue: toolRegistry },
      ],
    }).compile();

    service = moduleRef.get(VapiAssistantService);
  });

  // -----------------------------------------------------------------
  // createAssistant
  // -----------------------------------------------------------------

  describe('createAssistant', () => {
    it('creates a DB row + Vapi assistant when Vapi is enabled', async () => {
      (vapiClient.isEnabled as any).mockReturnValue(true);
      (vapiClient.createAssistant as any).mockResolvedValue({ id: 'vapi-1' });
      prisma.aiAgent.create.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        name: 'Sarah',
        type: 'VOICE',
        description: 'support agent',
        configuration: { vapiAssistantId: 'vapi-1', systemPrompt: 'You are Sarah', firstMessage: 'Hi there', model: 'gpt-4o', temperature: 0.7, maxTokens: 1000, voiceId: 'rachel' },
        capabilities: { tools: ['search_knowledge'] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dto: CreateAssistantDto = {
        name: 'Sarah',
        description: 'support agent',
        systemPrompt: 'You are Sarah',
        firstMessage: 'Hi there',
        tools: ['search_knowledge'],
      };

      const result = await service.createAssistant(dto, user as any);

      expect(result.id).toBe('agent-1');
      expect(result.name).toBe('Sarah');
      expect(result.vapiAssistantId).toBe('vapi-1');
      expect(result.systemPrompt).toBe('You are Sarah');
      expect(result.firstMessage).toBe('Hi there');
      expect(vapiClient.createAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sarah',
          firstMessage: 'Hi there',
          model: expect.objectContaining({
            messages: [{ role: 'system', content: 'You are Sarah' }],
            tools: expect.arrayContaining([
              expect.objectContaining({
                type: 'function',
                function: expect.objectContaining({ name: 'search_knowledge' }),
              }),
            ]),
          }),
        }),
      );
      expect(prisma.aiAgent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            name: 'Sarah',
            type: 'VOICE',
            configuration: expect.objectContaining({
              vapiAssistantId: 'vapi-1',
              systemPrompt: 'You are Sarah',
              firstMessage: 'Hi there',
            }),
            capabilities: { tools: ['search_knowledge'] },
            status: 'active',
          }),
        }),
      );
    });

    it('falls back to DB-only record when Vapi is disabled', async () => {
      (vapiClient.isEnabled as any).mockReturnValue(false);
      prisma.aiAgent.create.mockResolvedValue({
        id: 'agent-2',
        tenantId: 't1',
        name: 'Bot',
        type: 'VOICE',
        description: null,
        configuration: { vapiAssistantId: null, firstMessage: 'hi' },
        capabilities: { tools: ['search_knowledge', 'search_products'] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dto: CreateAssistantDto = { name: 'Bot' };
      const result = await service.createAssistant(dto, user as any);

      expect(vapiClient.createAssistant).not.toHaveBeenCalled();
      expect(result.vapiAssistantId).toBeNull();
      // Default system prompt is the assembled concatenation of all 4 prompts.
      expect(result.systemPrompt).toBe(buildDefaultSystemPrompt());
      // Default tools = all registered tools (2 in our mock registry).
      expect(result.tools).toEqual(['search_knowledge', 'search_products']);
    });

    it('falls back to DB-only when Vapi throws (best-effort)', async () => {
      (vapiClient.isEnabled as any).mockReturnValue(true);
      (vapiClient.createAssistant as any).mockRejectedValue(new Error('Vapi 500'));
      prisma.aiAgent.create.mockResolvedValue({
        id: 'agent-3',
        tenantId: 't1',
        name: 'Resilient',
        type: 'VOICE',
        description: null,
        configuration: { vapiAssistantId: null, firstMessage: 'hi' },
        capabilities: { tools: [] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createAssistant(
        { name: 'Resilient' },
        user as any,
      );

      expect(result.id).toBe('agent-3');
      expect(result.vapiAssistantId).toBeNull();
    });

    it('throws when tenantId is missing', async () => {
      await expect(
        service.createAssistant({ name: 'X' }, { userId: 'u1' } as any),
      ).rejects.toThrow('tenantId is required');
    });
  });

  // -----------------------------------------------------------------
  // getAssistant
  // -----------------------------------------------------------------

  describe('getAssistant', () => {
    it('returns the assistant for the caller tenant', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        name: 'Sarah',
        type: 'VOICE',
        description: null,
        configuration: {
          vapiAssistantId: 'vapi-1',
          systemPrompt: 'prompt',
          firstMessage: 'hi',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1000,
          voiceId: 'rachel',
        },
        capabilities: { tools: ['search_knowledge'] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getAssistant('agent-1', user as any);
      expect(result.id).toBe('agent-1');
      expect(result.name).toBe('Sarah');
      expect(result.vapiAssistantId).toBe('vapi-1');
      expect(result.tools).toEqual(['search_knowledge']);
    });

    it('throws NotFound when the assistant belongs to a different tenant', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        tenantId: 'other-tenant',
        name: 'X',
        type: 'VOICE',
      });
      await expect(
        service.getAssistant('agent-1', user as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the assistant does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.getAssistant('missing', user as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -----------------------------------------------------------------
  // listAssistants
  // -----------------------------------------------------------------

  describe('listAssistants', () => {
    it('returns assistants scoped to the caller tenant', async () => {
      prisma.aiAgent.findMany.mockResolvedValue([
        {
          id: 'a1',
          tenantId: 't1',
          name: 'Sarah',
          type: 'VOICE',
          description: null,
          configuration: { firstMessage: 'hi' },
          capabilities: { tools: [] },
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'a2',
          tenantId: 't1',
          name: 'Alex',
          type: 'SALES',
          description: null,
          configuration: { firstMessage: 'yo' },
          capabilities: { tools: ['search_products'] },
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const results = await service.listAssistants(user as any);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Sarah');
      expect(results[1].tools).toEqual(['search_products']);
      expect(prisma.aiAgent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // -----------------------------------------------------------------
  // updateAssistant
  // -----------------------------------------------------------------

  describe('updateAssistant', () => {
    it('updates name + system prompt + tools', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        name: 'Old',
        type: 'VOICE',
        description: null,
        configuration: {
          vapiAssistantId: 'vapi-1',
          systemPrompt: 'old prompt',
          firstMessage: 'hi',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1000,
          voiceId: 'rachel',
        },
        capabilities: { tools: ['search_knowledge'] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.aiAgent.update.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        name: 'New',
        type: 'VOICE',
        description: null,
        configuration: {
          vapiAssistantId: 'vapi-1',
          systemPrompt: 'new prompt',
          firstMessage: 'hi',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1000,
          voiceId: 'rachel',
        },
        capabilities: { tools: ['search_knowledge', 'search_products'] },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dto: UpdateAssistantDto = {
        name: 'New',
        systemPrompt: 'new prompt',
        tools: ['search_knowledge', 'search_products'],
      };

      const result = await service.updateAssistant('agent-1', dto, user as any);
      expect(result.name).toBe('New');
      expect(result.systemPrompt).toBe('new prompt');
      expect(result.tools).toEqual(['search_knowledge', 'search_products']);
      expect(prisma.aiAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: expect.objectContaining({
            name: 'New',
            configuration: expect.objectContaining({
              systemPrompt: 'new prompt',
            }),
            capabilities: { tools: ['search_knowledge', 'search_products'] },
          }),
        }),
      );
    });

    it('throws NotFound when the assistant does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAssistant('missing', { name: 'X' }, user as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -----------------------------------------------------------------
  // deleteAssistant
  // -----------------------------------------------------------------

  describe('deleteAssistant', () => {
    it('soft-deletes the DB row (status=inactive) + best-effort deletes Vapi assistant', async () => {
      (vapiClient.isEnabled as any).mockReturnValue(true);
      (vapiClient.deleteAssistant as any).mockResolvedValue({ id: 'vapi-1', deleted: true });
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        configuration: { vapiAssistantId: 'vapi-1' },
      });
      prisma.aiAgent.update.mockResolvedValue({ id: 'agent-1', status: 'inactive' });

      const result = await service.deleteAssistant('agent-1', user as any);
      expect(result).toEqual({ id: 'agent-1', deleted: true });
      expect(vapiClient.deleteAssistant).toHaveBeenCalledWith('vapi-1');
      expect(prisma.aiAgent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: { status: 'inactive' },
        }),
      );
    });

    it('still soft-deletes the DB row when Vapi is unavailable', async () => {
      (vapiClient.isEnabled as any).mockReturnValue(false);
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        tenantId: 't1',
        configuration: { vapiAssistantId: 'vapi-1' },
      });
      prisma.aiAgent.update.mockResolvedValue({ id: 'agent-1', status: 'inactive' });

      const result = await service.deleteAssistant('agent-1', user as any);
      expect(result.deleted).toBe(true);
      expect(vapiClient.deleteAssistant).not.toHaveBeenCalled();
    });

    it('throws NotFound when the assistant does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.deleteAssistant('missing', user as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
