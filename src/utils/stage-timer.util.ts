/**
 * Lightweight stage timing helpers used to diagnose OCR pipeline latency.
 *
 * Every line is prefixed with `[TIMING]` so a full document run can be
 * reconstructed with: `grep "\[TIMING\]" <logs> | grep <documentId>`.
 */
export const TIMING_LOG_PREFIX = '[TIMING]';

export interface TimingLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface QueueJobTimingInfo {
  timestamp?: number;
  processedOn?: number;
  attemptsMade?: number;
}

/**
 * Runs `operation`, logging how long it took. Errors are logged with their
 * elapsed time and rethrown unchanged so control flow is never altered.
 */
export async function timeStage<T>(
  logger: TimingLogger,
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logger.log(`${TIMING_LOG_PREFIX} ${label} ok in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String((error as Error)?.message);
    logger.warn(
      `${TIMING_LOG_PREFIX} ${label} failed after ${Date.now() - startedAt}ms: ${message}`,
    );
    throw error;
  }
}

/**
 * Describes how long a BullMQ job waited in the queue (includes retry backoff
 * delays) before the worker picked it up.
 */
export function describeQueueWait(job: QueueJobTimingInfo, now: number = Date.now()): string {
  const attempt = (job.attemptsMade || 0) + 1;
  if (!job.timestamp) {
    return `${TIMING_LOG_PREFIX} queueWait=unknown attempt=${attempt}`;
  }
  const startedAt = job.processedOn || now;
  return `${TIMING_LOG_PREFIX} queueWait=${startedAt - job.timestamp}ms attempt=${attempt}`;
}
