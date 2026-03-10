import { isQuotaError, normalizeErrorMessage, parseStatusCode } from './helpers.js';
import type { BatchStage, BatchTelemetryEntry } from './types.js';

export function getOrCreateTelemetryEntry(
  telemetry: Map<string, BatchTelemetryEntry>,
  url: string
): BatchTelemetryEntry {
  const existing = telemetry.get(url);
  if (existing) return existing;

  const entry: BatchTelemetryEntry = {
    url,
    startedAt: Date.now(),
    extractAttempts: 0,
    analyzeAttempts: 0,
    finalStatus: 'failed',
    finalStage: 'n/a',
    errorType: '',
    errorMessage: '',
    durationMs: 0,
  };
  telemetry.set(url, entry);
  return entry;
}

export function markTelemetrySuccess(telemetry: Map<string, BatchTelemetryEntry>, url: string) {
  const entry = getOrCreateTelemetryEntry(telemetry, url);
  entry.finalStatus = 'success';
  entry.finalStage = 'analyze';
  entry.errorType = '';
  entry.errorMessage = '';
  entry.durationMs = Date.now() - entry.startedAt;
}

export function markTelemetryFailure(
  telemetry: Map<string, BatchTelemetryEntry>,
  url: string,
  err: unknown
) {
  const entry = getOrCreateTelemetryEntry(telemetry, url);
  const stage = getErrorStage(err);
  const message = normalizeErrorMessage(err);
  entry.finalStatus = 'failed';
  entry.finalStage = stage;
  entry.errorType = classifyErrorType(err, stage);
  entry.errorMessage = message;
  entry.durationMs = Date.now() - entry.startedAt;
}

export function getErrorStage(err: unknown): BatchStage | 'n/a' {
  const stage = (err as { stage?: BatchStage })?.stage;
  if (stage === 'extract' || stage === 'analyze') return stage;
  return 'n/a';
}

function classifyErrorType(err: unknown, stage: BatchStage | 'n/a'): string {
  const message = normalizeErrorMessage(err).toLowerCase();
  if (isQuotaError(err)) return 'quota_limit';

  const code = parseStatusCode(message);
  if (code !== null) return `http_${code}`;

  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('network') || message.includes('failed to fetch')) return 'network';
  if (message.includes('invalid json')) return 'backend_response';
  if (message.includes('thin_content')) return 'thin_content';
  if (message.includes('restricted')) return 'restricted';

  if (stage === 'extract') return 'extract_error';
  if (stage === 'analyze') return 'analyze_error';
  return 'unknown';
}

export function logBatchTelemetrySummary(
  telemetry: Map<string, BatchTelemetryEntry>,
  inputUrls: string[]
) {
  if (telemetry.size === 0) return;

  const rows = inputUrls
    .filter((url) => telemetry.has(url))
    .map((url) => telemetry.get(url)!)
    .map((entry) => ({
      url: entry.url,
      status: entry.finalStatus,
      stage: entry.finalStage,
      extract_attempts: entry.extractAttempts,
      analyze_attempts: entry.analyzeAttempts,
      error_type: entry.errorType || '-',
      error: entry.errorMessage || '-',
      duration_ms: entry.durationMs,
    }));

  const successCount = rows.filter((r) => r.status === 'success').length;
  const failedCount = rows.length - successCount;

  console.groupCollapsed(
    `[Batch Telemetry] processed=${rows.length} success=${successCount} failed=${failedCount}`
  );
  console.table(rows);
  console.groupEnd();
}
