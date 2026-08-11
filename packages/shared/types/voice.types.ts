export interface VoiceCall {
  id: string;
  sessionId: string;
  tenantId: string;
  direction: 'inbound' | 'outbound';
  status: 'initiated' | 'ringing' | 'in_progress' | 'ended' | 'failed' | 'cancelled';
  from?: string;
  to?: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
}

export interface VoiceTranscript {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokensUsed?: number;
  confidence?: number;
  createdAt: Date;
}
