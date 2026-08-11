import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ConversationsService } from './conversations.service';
import { MemoryService } from './memory.service';
import { ToolsService } from './tools.service';
import { AiController } from './ai.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RagModule } from '../../rag/rag.module';
import { AbstainPolicyModule } from '../../rag/abstain/abstain-policy.module';

@Module({
  imports: [KnowledgeModule, RagModule, AbstainPolicyModule],
  controllers: [AiController],
  providers: [AiService, ConversationsService, MemoryService, ToolsService],
  exports: [AiService, ConversationsService, MemoryService, ToolsService],
})
export class AiModule {}
