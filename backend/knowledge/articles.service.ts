import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { AuthUser } from '../ai/auth-user';
import {
  CreateArticleDto,
  UpdateArticleDto,
  QueryArticlesDto,
  SearchArticlesDto,
  MarkHelpfulDto,
  ArticleStatus,
} from './dto/articles.dto';

/**
 * Knowledge articles service — powers the public help center.
 *
 * Articles are tenant-scoped (every tenant gets its own help center).
 * The `findAll` / `findBySlug` / `search` methods return only
 * `published` articles — the admin-only `create` / `update` / `remove`
 * methods are how drafts are managed.
 *
 * `markHelpful(id, helpful)` increments either `helpfulCount` or the
 * `notHelpfulCount` (stored in `metadata`) so the analytics dashboard
 * can rank articles by usefulness.
 */
@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List published articles, optionally filtered by category / tag /
   * search term. Public — no `AuthUser` required.
   */
  async findAll(query: QueryArticlesDto, tenantId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { status: ArticleStatus.PUBLISHED };
    if (tenantId) where.tenantId = tenantId;
    if (query.category) where.category = query.category;
    if (query.tag) where.tags = { has: query.tag };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [articles, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          category: true,
          tags: true,
          viewCount: true,
          helpfulCount: true,
          publishedAt: true,
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);

    return {
      data: articles,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Public fetch by id (must be published). The admin-only "any status"
   * fetch is `findOneAdmin` below.
   */
  async findOne(id: string, tenantId?: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
    });
    if (!article || article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    if (tenantId && article.tenantId !== tenantId) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    return article;
  }

  /**
   * Public fetch by slug. Same tenant + published constraints as
   * {@link findOne}.
   */
  async findBySlug(slug: string, tenantId?: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { slug, status: ArticleStatus.PUBLISHED },
    });
    if (!article) {
      throw new NotFoundException(`Article with slug '${slug}' not found`);
    }
    if (tenantId && article.tenantId !== tenantId) {
      throw new NotFoundException(`Article with slug '${slug}' not found`);
    }
    // Increment view count — fire-and-forget so the response isn't
    // delayed by the write.
    void this.prisma.knowledgeArticle
      .update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {
        // ignore — best-effort
      });
    return article;
  }

  // ---------------------------------------------------------------------
  // Admin operations
  // ---------------------------------------------------------------------

  async create(dto: CreateArticleDto, user: AuthUser) {
    return this.prisma.knowledgeArticle.create({
      data: {
        tenantId: user.tenantId!,
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
        excerpt: dto.excerpt,
        category: dto.category,
        tags: dto.tags ?? [],
        authorId: user.userId,
        status: dto.status ?? ArticleStatus.DRAFT,
        publishedAt:
          dto.status === ArticleStatus.PUBLISHED ? new Date() : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateArticleDto, user: AuthUser) {
    const existing = await this.findForAdmin(id, user);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.status !== undefined) {
      data.status = dto.status;
      // Stamp publishedAt when transitioning to published for the first
      // time (leave it untouched on subsequent updates).
      if (
        dto.status === ArticleStatus.PUBLISHED &&
        existing.status !== ArticleStatus.PUBLISHED
      ) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data,
    });
  }

  /**
   * Soft-delete — flip status to `archived`. The row is preserved for
   * audit and to keep `slug` unique within the tenant.
   */
  async remove(id: string, user: AuthUser) {
    const existing = await this.findForAdmin(id, user);
    await this.prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: { status: ArticleStatus.ARCHIVED },
    });
    return { success: true, id: existing.id };
  }

  // ---------------------------------------------------------------------
  // Search + feedback
  // ---------------------------------------------------------------------

  /**
   * Full-text search across published articles. Returns matching
   * articles ranked by recency (Postgres FTS ranking would require a
   * `tsvector` column — out of scope for this phase).
   */
  async search(query: SearchArticlesDto, tenantId?: string) {
    const limit = query.limit ?? 10;
    const where: any = {
      status: ArticleStatus.PUBLISHED,
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { excerpt: { contains: query.q, mode: 'insensitive' } },
        { content: { contains: query.q, mode: 'insensitive' } },
      ],
    };
    if (tenantId) where.tenantId = tenantId;

    return this.prisma.knowledgeArticle.findMany({
      where,
      take: limit,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        category: true,
        viewCount: true,
        helpfulCount: true,
        publishedAt: true,
      },
    });
  }

  /**
   * Increment `helpfulCount` or the `notHelpfulCount` (stored in
   * `metadata.notHelpfulCount`) so the analytics dashboard can rank
   * articles by usefulness.
   *
   * `helpful: 'yes'` → helpfulCount++. `helpful: 'no'` → metadata
   * `.notHelpfulCount`++ (created on first 'no' vote).
   */
  async markHelpful(id: string, dto: MarkHelpfulDto, tenantId?: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
    });
    if (!article || article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    if (tenantId && article.tenantId !== tenantId) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    if (dto.helpful === 'yes') {
      return this.prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { helpfulCount: { increment: 1 } },
        select: { id: true, helpfulCount: true, viewCount: true },
      });
    }

    // 'no' — bump notHelpfulCount inside metadata.
    const meta = (article.metadata as Record<string, any> | null) ?? {};
    const notHelpful = (meta.notHelpfulCount as number | undefined) ?? 0;
    return this.prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: {
        metadata: { ...meta, notHelpfulCount: notHelpful + 1 },
      },
      select: { id: true, helpfulCount: true, viewCount: true },
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /** Admin fetch — returns the article regardless of status (any tenant). */
  private async findForAdmin(id: string, user: AuthUser) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
    });
    if (!article || article.tenantId !== user.tenantId) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    return article;
  }
}
