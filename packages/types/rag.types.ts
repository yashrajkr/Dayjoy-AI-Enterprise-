export interface RagDocument {
  id: string;
  tenantId: string;
  sourceId: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  wordCount?: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
}

export interface RagChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  tokens?: number;
  embedding?: number[];
}

export interface RagQueryResult {
  chunkId: string;
  content: string;
  score: number;
  documentId: string;
  documentTitle: string;
  metadata?: Record<string, any>;
}
