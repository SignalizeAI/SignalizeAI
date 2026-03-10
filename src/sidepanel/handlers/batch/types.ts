export interface Content {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

export interface BatchResult {
  url: string;
  domain: string;
  content: Content;
  analysis: any;
  contentHash: string;
  status: 'ready' | 'saved' | 'error';
  error?: string;
}

export type BatchStage = 'extract' | 'analyze';

export interface BatchTelemetryEntry {
  url: string;
  startedAt: number;
  extractAttempts: number;
  analyzeAttempts: number;
  finalStatus: 'success' | 'failed';
  finalStage: BatchStage | 'n/a';
  errorType: string;
  errorMessage: string;
  durationMs: number;
}
