/**
 * Vapi Analytics Types
 * 
 * Type definitions for analytics and logging
 */

/**
 * Call Metrics
 */
export interface CallMetrics {
  callId: string;
  phoneNumber: string;
  duration: number; // seconds
  status: 'completed' | 'failed' | 'abandoned' | 'escalated';
  startTime: Date;
  endTime: Date;
  transcript: string;
  recordingUrl?: string;
  customerId?: string;
  distributorId?: string;
  flowType: string;
  resolution: 'resolved' | 'unresolved' | 'escalated';
  customerSatisfaction?: number; // 1-5
  metadata: Record<string, any>;
}

/**
 * Tool Usage Metrics
 */
export interface ToolUsageMetrics {
  toolName: string;
  callId: string;
  executionTime: number; // ms
  success: boolean;
  error?: string;
  parameters: Record<string, any>;
  result?: any;
  timestamp: Date;
}

/**
 * AI Performance Metrics
 */
export interface AIPerformanceMetrics {
  callId: string;
  responseTime: number; // ms
  accuracy: number; // 0-1
  relevance: number; // 0-1
  helpfulness: number; // 0-1
  hallucinationDetected: boolean;
  fallbackUsed: boolean;
  escalationTriggered: boolean;
  timestamp: Date;
}

/**
 * Daily Analytics Summary
 */
export interface DailyAnalyticsSummary {
  date: Date;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  escalatedCalls: number;
  averageDuration: number; // seconds
  totalToolExecutions: number;
  successfulToolExecutions: number;
  averageAIResponseTime: number; // ms
  averageAccuracy: number;
  customerSatisfactionAvg: number;
}

/**
 * Analytics Event
 */
export interface AnalyticsEvent {
  id: string;
  eventType: string;
  data: Record<string, any>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Dashboard Metrics
 */
export interface DashboardMetrics {
  realtime: {
    activeCalls: number;
    callsToday: number;
    averageWaitTime: number;
  };
  daily: DailyAnalyticsSummary;
  trends: {
    callsLast7Days: number[];
    accuracyLast7Days: number[];
    satisfactionLast7Days: number[];
  };
  topTools: {
    name: string;
    executions: number;
    successRate: number;
  }[];
}