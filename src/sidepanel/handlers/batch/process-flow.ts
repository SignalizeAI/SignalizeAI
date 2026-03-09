import { state } from '../../state.js';
import { loadQuotaFromAPI, renderQuotaBanner } from '../../quota.js';
import { analyzeWebsiteContent } from '../../../ai-analyze.js';
import { hashContent } from '../../cache.js';
import { fetchAndExtractContent } from '../../analysis/fetcher.js';
import {
  isQuotaError,
  isRetryableError,
  normalizeErrorMessage,
  trimContentForAnalyze,
} from './helpers.js';
import {
  BATCH_CONCURRENCY,
  BATCH_DELAY_BETWEEN_GROUPS,
  ANALYZE_FAILURE_COOLDOWN_MS,
  ANALYZE_MIN_INTERVAL_MS,
  ANALYZE_ADAPTIVE_COOLDOWN_BASE_MS,
  ANALYZE_ADAPTIVE_COOLDOWN_MAX_MS,
  ANALYZE_ADAPTIVE_COOLDOWN_STEP_DOWN_MS,
  ANALYZE_RETRY_ATTEMPTS,
  ANALYZE_RETRY_ATTEMPTS_LARGE_BATCH,
  ANALYZE_RETRY_BASE_DELAY_MS,
  LARGE_BATCH_THRESHOLD,
  MAX_BACKOFF_MS,
  RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MS,
  BATCH_ENABLE_TELEMETRY_LOG,
} from './constants.js';
import { batchState } from './state.js';
import {
  getErrorStage,
  getOrCreateTelemetryEntry,
  logBatchTelemetrySummary,
  markTelemetryFailure,
  markTelemetrySuccess,
} from './telemetry.js';
import type { BatchStage, BatchTelemetryEntry } from './types.js';

interface ProcessFlowDeps {
  updateProgress: (current: number, total: number) => void;
  appendResultItem: (url: string, statusText: string, isError: boolean) => void;
  onDone: () => void;
}

export async function startBatchProcess(urls: string[], deps: ProcessFlowDeps) {
  const { updateProgress, appendResultItem, onDone } = deps;

  const progressContainer = document.getElementById('batch-progress-container');
  const resultsPhase = document.getElementById('batch-results-list');
  const cancelBtn = document.getElementById('batch-cancel-btn');

  if (progressContainer) progressContainer.classList.remove('hidden');
  if (resultsPhase) resultsPhase.innerHTML = '';
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel';
    cancelBtn.removeAttribute('disabled');
  }

  batchState.isBatchCancelled = false;
  batchState.currentBatchSize = urls.length;
  batchState.tempBatchResults = [];
  batchState.analyzeQueue = Promise.resolve();
  batchState.lastAnalyzeAt = 0;
  batchState.analyzeBackoffUntil = 0;
  batchState.analyzeCooldownMs = ANALYZE_ADAPTIVE_COOLDOWN_BASE_MS;
  updateProgress(0, urls.length);

  await loadQuotaFromAPI();
  if (state.currentPlan === 'free' && state.remainingToday !== null && state.remainingToday <= 0) {
    appendResultItem('Batch stopped', 'Daily limit reached', true);
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.add('hidden');
      onDone();
    }, 700);
    return;
  }

  let processedCount = 0;
  let stopDueToQuota = false;
  const telemetry = new Map<string, BatchTelemetryEntry>();
  let sawTransientAnalyzeFailureInBatch = false;

  for (let i = 0; i < urls.length; i += BATCH_CONCURRENCY) {
    if (batchState.isBatchCancelled) {
      appendResultItem('Batch cancelled', 'Stopped', true);
      break;
    }

    const batchUrls = urls.slice(i, i + BATCH_CONCURRENCY);
    const batchPromises = batchUrls.map((url) =>
      processSingleUrlWithRetry(url, telemetry).catch((err) => ({ url, error: err }))
    );

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if ('error' in result && result.error) {
        markTelemetryFailure(telemetry, result.url, result.error);
        const errMessage = normalizeErrorMessage(result.error);
        appendResultItem(result.url, errMessage, true);
        if (isQuotaError(result.error)) {
          stopDueToQuota = true;
        }
        if (isTransientAnalyzeFailure(result.error)) {
          sawTransientAnalyzeFailureInBatch = true;
        }
      } else {
        markTelemetrySuccess(telemetry, result.url);
        batchState.tempBatchResults.push({
          url: result.url,
          domain: new URL(result.url).hostname,
          content: result.content,
          analysis: result.analysis,
          contentHash: result.contentHash,
          status: 'ready',
        });
        appendResultItem(result.url, 'Analyzed', false);
      }
    }

    processedCount += batchUrls.length;
    updateProgress(Math.min(processedCount, urls.length), urls.length);

    if (stopDueToQuota) {
      appendResultItem('Batch stopped', 'Daily limit reached', true);
      break;
    }

    if (i + BATCH_CONCURRENCY < urls.length && !batchState.isBatchCancelled && !stopDueToQuota) {
      if (sawTransientAnalyzeFailureInBatch) {
        await sleep(ANALYZE_FAILURE_COOLDOWN_MS);
        sawTransientAnalyzeFailureInBatch = false;
      }
      await sleep(BATCH_DELAY_BETWEEN_GROUPS);
    }
  }

  if (BATCH_ENABLE_TELEMETRY_LOG) {
    logBatchTelemetrySummary(telemetry, urls);
  }

  setTimeout(async () => {
    await loadQuotaFromAPI(true);
    if (progressContainer) progressContainer.classList.add('hidden');
    batchState.currentBatchSize = 0;
    onDone();
  }, 1000);
}

async function processSingleUrl(url: string, telemetry: Map<string, BatchTelemetryEntry>) {
  const entry = getOrCreateTelemetryEntry(telemetry, url);
  entry.extractAttempts += 1;

  const response = await fetchAndExtractContent(url, true);
  const extractErrorMessage = response?.error || response?.reason || 'Extraction failed';
  const contentForAnalyze = response?.ok && response.content ? response.content : null;

  if (!contentForAnalyze) throw withStageError('extract', extractErrorMessage);

  entry.analyzeAttempts += 1;
  let result: Awaited<ReturnType<typeof analyzeWebsiteContent>>;
  try {
    const trimmedContent = trimContentForAnalyze(contentForAnalyze);
    result = await enqueueAnalyzeCall(() =>
      analyzeWebsiteContent(trimmedContent, false, false, true)
    );
  } catch (err: unknown) {
    throw withStageError('analyze', normalizeErrorMessage(err));
  }

  if (result.quota) {
    state.currentPlan = result.quota.plan;
    state.usedToday = result.quota.used_today;
    state.remainingToday = result.quota.remaining_today;
    state.dailyLimitFromAPI = result.quota.daily_limit;
    state.maxSavedLimit = result.quota.max_saved;
    state.totalSavedCount = result.quota.total_saved;
    renderQuotaBanner();
  }
  if (result.blocked) throw withStageError('analyze', 'Daily limit reached');
  if (!result.analysis) throw withStageError('analyze', 'AI analysis failed');

  return {
    url,
    content: contentForAnalyze,
    analysis: result.analysis,
    contentHash: await hashContent(contentForAnalyze),
  };
}

function enqueueAnalyzeCall<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runTask = async () => {
      await waitForAnalyzeWindow();
      try {
        const result = await task();
        decayAnalyzeCooldown();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    batchState.analyzeQueue = batchState.analyzeQueue.then(runTask, runTask).then(
      () => undefined,
      () => undefined
    );
  });
}

async function processSingleUrlWithRetry(
  url: string,
  telemetry: Map<string, BatchTelemetryEntry>,
  attempt = 1
): Promise<any> {
  try {
    return await processSingleUrl(url, telemetry);
  } catch (err: any) {
    const isAnalyzeStage = getErrorStage(err) === 'analyze';
    const retryable = isRetryableError(err);
    if (isAnalyzeStage && retryable) {
      registerAnalyzeBackoff(err);
    }
    const analyzeMaxAttempts =
      batchState.currentBatchSize >= LARGE_BATCH_THRESHOLD
        ? ANALYZE_RETRY_ATTEMPTS_LARGE_BATCH
        : ANALYZE_RETRY_ATTEMPTS;
    const maxAttempts = isAnalyzeStage ? analyzeMaxAttempts : RETRY_ATTEMPTS;
    const shouldRetry = retryable && attempt < maxAttempts;

    if (shouldRetry) {
      const baseDelay = isAnalyzeStage ? ANALYZE_RETRY_BASE_DELAY_MS : RETRY_BASE_DELAY_MS;
      const backoff = Math.min(baseDelay * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
      const cooldownWait = Math.max(0, batchState.analyzeBackoffUntil - Date.now());
      await sleep(Math.max(backoff + jitter, cooldownWait));
      return processSingleUrlWithRetry(url, telemetry, attempt + 1);
    }

    throw err;
  }
}

function withStageError(stage: BatchStage, message: string): Error & { stage: BatchStage } {
  const error = new Error(message) as Error & { stage: BatchStage };
  error.stage = stage;
  return error;
}

function isTransientAnalyzeFailure(err: unknown): boolean {
  if (getErrorStage(err) !== 'analyze') return false;
  if (isQuotaError(err)) return false;
  return isRetryableError(err);
}

function registerAnalyzeBackoff(err: unknown) {
  const message = normalizeErrorMessage(err).toLowerCase();
  const multiplier = isHeavyThrottleSignal(message) ? 2 : 1.35;
  const currentCooldown = Math.max(batchState.analyzeCooldownMs, ANALYZE_ADAPTIVE_COOLDOWN_BASE_MS);
  const nextCooldown = Math.min(
    Math.round(currentCooldown * multiplier),
    ANALYZE_ADAPTIVE_COOLDOWN_MAX_MS
  );

  batchState.analyzeCooldownMs = nextCooldown;
  const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
  batchState.analyzeBackoffUntil = Math.max(batchState.analyzeBackoffUntil, Date.now() + nextCooldown + jitter);
}

function decayAnalyzeCooldown() {
  if (batchState.analyzeCooldownMs <= ANALYZE_ADAPTIVE_COOLDOWN_BASE_MS) return;
  batchState.analyzeCooldownMs = Math.max(
    ANALYZE_ADAPTIVE_COOLDOWN_BASE_MS,
    batchState.analyzeCooldownMs - ANALYZE_ADAPTIVE_COOLDOWN_STEP_DOWN_MS
  );
}

async function waitForAnalyzeWindow() {
  const now = Date.now();
  const minIntervalUntil = batchState.lastAnalyzeAt + ANALYZE_MIN_INTERVAL_MS;
  const waitUntil = Math.max(minIntervalUntil, batchState.analyzeBackoffUntil);
  if (waitUntil > now) {
    await sleep(waitUntil - now);
  }
  batchState.lastAnalyzeAt = Date.now();
}

function isHeavyThrottleSignal(message: string): boolean {
  return (
    message.includes('throttled') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('503')
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
