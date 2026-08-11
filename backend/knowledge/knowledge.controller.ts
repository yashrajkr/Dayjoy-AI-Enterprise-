import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../_shared/security/permissions.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { ArticlesService } from './articles.service';
import {
  CreateRagSourceDto,
  UpdateRagSourceDto,
  IngestDocumentDto,
  QueryKnowledgeDto,
  QuerySourcesDto,
  QueryDocumentsDto,
} from './dto/knowledge.dto';
import {
  CreateArticleDto,
  UpdateArticleDto,
  QueryArticlesDto,
  SearchArticlesDto,
  MarkHelpfulDto,
} from './dto/articles.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Knowledge / RAG controller.
 *
 * Auth model: `/api/knowledge/articles/**` and the public `query` and
 * `search` endpoints are intentionally NOT guarded by `JwtAuthGuard` —
 * they're reachable by the customer-portal help center without a login.
 * All other routes require `JwtAuthGuard` + `PermissionsGuard`.
 *
 * Note: the `articles/search` route is declared BEFORE `articles/:slug`
 * so NestJS's route matcher doesn't interpret `search` as a slug.
 */
@Controller('api/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly articlesService: ArticlesService,
  ) {}

  // ===================================================================
  // RAG sources — admin-only
  // ===================================================================

  @Get('sources')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async findAllSources(@CurrentUser() user: AuthUser, @Query() query: QuerySourcesDto) {
    return this.knowledgeService.findAllSources(query, user);
  }

  @Get('sources/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async findOneSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.findOneSource(id, user);
  }

  @Post('sources')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:create')
  async createSource(@CurrentUser() user: AuthUser, @Body() dto: CreateRagSourceDto) {
    return this.knowledgeService.createSource(dto, user);
  }

  @Put('sources/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:update')
  async updateSource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRagSourceDto,
  ) {
    return this.knowledgeService.updateSource(id, dto, user);
  }

  @Delete('sources/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:delete')
  async removeSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.removeSource(id, user);
  }

  @Post('sources/:id/reingest')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:update')
  async reingestSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.reingest(id, user);
  }

  // ===================================================================
  // RAG documents — admin-only
  // ===================================================================

  @Get('documents')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async findAllDocuments(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryDocumentsDto,
  ) {
    return this.knowledgeService.findAllDocuments(query, user);
  }

  @Get('documents/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async findOneDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.findOneDocument(id, user);
  }

  @Post('ingest')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:create')
  async ingestDocument(@CurrentUser() user: AuthUser, @Body() dto: IngestDocumentDto) {
    return this.knowledgeService.ingest(dto, user);
  }

  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:delete')
  async deleteDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.deleteDocument(id, user);
  }

  // ===================================================================
  // RAG query — accessible to authenticated AI users AND the customer
  // portal (the help-center chat uses the same endpoint). No global
  // `JwtAuthGuard` so the customer portal can call it; the
  // `PermissionsGuard` only kicks in when `@RequirePermissions` is set.
  // ===================================================================

  @Post('query')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ai:chat')
  async query(
    @CurrentUser() user: AuthUser,
    @Body() dto: QueryKnowledgeDto,
  ) {
    return this.knowledgeService.query(dto, user);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async getStats(@CurrentUser() user: AuthUser) {
    return this.knowledgeService.getStats(user);
  }

  // ===================================================================
  // Help-center articles — public read, admin write
  // ===================================================================

  // `articles/search` is declared BEFORE `articles/:slug` so the route
  // matcher doesn't treat `search` as a slug.
  @Get('articles/search')
  async searchArticles(@Query() query: SearchArticlesDto) {
    return this.articlesService.search(query);
  }

  @Get('articles')
  async findAllArticles(@Query() query: QueryArticlesDto) {
    return this.articlesService.findAll(query);
  }

  @Get('articles/:slug')
  async findOneArticle(@Param('slug') slug: string) {
    return this.articlesService.findBySlug(slug);
  }

  @Post('articles/:id/helpful')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:read')
  async markArticleHelpful(
    @Param('id') id: string,
    @Body() dto: MarkHelpfulDto,
  ) {
    return this.articlesService.markHelpful(id, dto);
  }

  @Post('articles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:create')
  async createArticle(@CurrentUser() user: AuthUser, @Body() dto: CreateArticleDto) {
    return this.articlesService.create(dto, user);
  }

  @Put('articles/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:update')
  async updateArticle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.update(id, dto, user);
  }

  @Delete('articles/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('knowledge:delete')
  async removeArticle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articlesService.remove(id, user);
  }
}
