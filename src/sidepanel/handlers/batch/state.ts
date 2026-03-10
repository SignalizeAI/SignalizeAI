import type { BatchResult } from './types.js';

export interface BatchRuntimeState {
  isBatchCancelled: boolean;
  tempBatchResults: BatchResult[];
  pendingCsvUrls: string[];
  batchSearchQuery: string;
  batchCurrentPage: number;
  isBatchSelectionMode: boolean;
  lastBatchInputMode: 'csv' | 'paste';
  analyzeQueue: Promise<void>;
  currentBatchSize: number;
  isBatchPageTransitioning: boolean;
  lastAnalyzeAt: number;
  analyzeBackoffUntil: number;
  analyzeCooldownMs: number;
}

export const batchState: BatchRuntimeState = {
  isBatchCancelled: false,
  tempBatchResults: [],
  pendingCsvUrls: [],
  batchSearchQuery: '',
  batchCurrentPage: 1,
  isBatchSelectionMode: false,
  lastBatchInputMode: 'csv',
  analyzeQueue: Promise.resolve(),
  currentBatchSize: 0,
  isBatchPageTransitioning: false,
  lastAnalyzeAt: 0,
  analyzeBackoffUntil: 0,
  analyzeCooldownMs: 0,
};
