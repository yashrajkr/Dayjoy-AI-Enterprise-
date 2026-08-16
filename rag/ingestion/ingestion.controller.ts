import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../backend/auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../backend/_shared/security/permissions.guard';
import { CurrentUser } from '../../backend/_shared/common/decorators/current-user.decorator';
import type { AuthUser } from '../../backend/ai/auth-user';
import { IngestionService } from './ingestion-service';
import {
  IngestBatchDto,
  IngestDocumentDto,
  RagSourceType,
} from './ingestion.dto';

/**
 * RAG Ingestion Controller
 * -------------------------
 *
 * REST endpoints under `/api/rag/ingest` for ingesting documents into
 * the RAG pipeline. All endpoints require authentication
 * (`JwtAuthGuard`) AND the `knowledge:create` permission (admin-only).
 *
 * Routes:
 *  - `POST /api/rag/ingest`            — ingest a single document
 *                                        (JSON body with inline text,
 *                                        or multipart with file)
 *  - `POST /api/rag/ingest/batch`      — ingest multiple documents
 *  - `POST /api/rag/ingest/upload`     — file upload (multipart/form-data)
 *  - `DELETE /api/rag/ingest/:documentId` — soft-delete a document
 *  - `POST /api/rag/ingest/sources/:sourceId/reingest` — re-ingest a source
 *
 * Note: this controller is intentionally focused on ingestion only.
 * Retrieval / query endpoints live in the `rag/retriever/` module
 * (owned by Agent G).
 */
@Controller('api/rag/ingest')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Ingest a single document from inline JSON content.
   *
   * Body:
   *  - `sourceName` OR `sourceId` — names the RagSource (auto-created if missing)
   *  - `title`                    — document title
   *  - `content`                  — raw text to chunk + embed
   *  - `mimeType?`                — defaults to `text/plain`
   *  - `category?`, `tags?`       — optional metadata
   */
  @Post()
  @RequirePermissions('knowledge:create')
  @HttpCode(HttpStatus.CREATED)
  async ingestDocument(
    @CurrentUser() user: AuthUser,
    @Body() dto: IngestDocumentDto,
  ) {
    return this.ingestionService.ingestDocument(dto, user);
  }

  /**
   * Ingest multiple documents in a single request. Up to 50 documents
   * per request; processed in parallel batches of 5 internally.
   */
  @Post('batch')
  @RequirePermissions('knowledge:create')
  @HttpCode(HttpStatus.CREATED)
  async ingestBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: IngestBatchDto,
  ) {
    return this.ingestionService.ingestBatch(dto.documents, user);
  }

  /**
   * File upload endpoint — multipart/form-data with a single `file`
   * field plus form fields for `title`, `sourceName`, `category`,
   * `tags`. The MIME type is taken from the uploaded file's
   * `mimetype` property.
   */
  @Post('upload')
  @RequirePermissions('knowledge:create')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; sourceName?: string; sourceId?: string; category?: string; tags?: string },
  ) {
    if (!file) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'No file uploaded — expected multipart field "file"',
      };
    }

    const tags = body.tags
      ? body.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    const dto: IngestDocumentDto = {
      title: body.title ?? file.originalname,
      sourceType: RagSourceType.DOCUMENT,
      sourceName: body.sourceName,
      sourceId: body.sourceId,
      filename: file.originalname,
      mimeType: file.mimetype,
      category: body.category,
      tags,
      fileBuffer: file.buffer,
    };

    return this.ingestionService.ingestDocument(dto, user);
  }

  /**
   * Soft-delete a document — chunks/embeddings are hard-deleted, the
   * `RagDocument` row is marked `DELETED` for audit history.
   */
  @Delete(':documentId')
  @RequirePermissions('knowledge:delete')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
  ) {
    await this.ingestionService.deleteDocument(documentId, user);
    return { success: true, id: documentId };
  }

  /**
   * Re-ingest all documents for a source — deletes existing chunks +
   * embeddings, then re-runs the pipeline against the stored
   * `RagDocument.content` for each document. Useful when the chunking
   * strategy or embedding model has changed.
   */
  @Post('sources/:sourceId/reingest')
  @RequirePermissions('knowledge:update')
  @HttpCode(HttpStatus.OK)
  async reingestSource(
    @CurrentUser() user: AuthUser,
    @Param('sourceId') sourceId: string,
  ) {
    return this.ingestionService.reingestSource(sourceId, user);
  }
}
