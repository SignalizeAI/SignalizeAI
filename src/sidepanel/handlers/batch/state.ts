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
  analyzeCircuitOpenUntil: number;
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
  analyzeCircuitOpenUntil: 0,
};
