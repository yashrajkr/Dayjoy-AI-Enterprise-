import { Module } from '@nestjs/common';
import { PdfLoader } from './pdf.loader';
import { DocxLoader } from './docx.loader';
import { MarkdownLoader } from './markdown.loader';
import { TextLoader } from './text.loader';
import { CsvLoader } from './csv.loader';
import { HtmlLoader } from './html.loader';
import { DocumentLoaderFactory } from './loader.factory';

/**
 * Document Loaders Module
 * ------------------------
 *
 * Wires every format-specific loader + the {@link DocumentLoaderFactory}
 * into the NestJS DI container. Imported by {@link RagModule} so the
 * {@link IngestionService} can inject the factory and resolve the
 * correct loader per upload.
 *
 * Loaders are pure transformations (no DB / API access), so they're
 * safe to register as singleton providers.
 */
@Module({
  providers: [
    PdfLoader,
    DocxLoader,
    MarkdownLoader,
    TextLoader,
    CsvLoader,
    HtmlLoader,
    DocumentLoaderFactory,
  ],
  exports: [
    PdfLoader,
    DocxLoader,
    MarkdownLoader,
    TextLoader,
    CsvLoader,
    HtmlLoader,
    DocumentLoaderFactory,
  ],
})
export class LoadersModule {}
