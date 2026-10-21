import { describeQueueWait, timeStage, TIMING_LOG_PREFIX } from '../stage-timer.util.js';

describe('stage-timer.util', () => {
  const createLogger = () => ({ log: jest.fn(), warn: jest.fn() });

  describe('timeStage', () => {
    it('returns the operation result and logs a success timing line', async () => {
      const logger = createLogger();

      const result = await timeStage(logger, 'doc=1 stage=ocr', async () => 'value');

      expect(result).toBe('value');
      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log.mock.calls[0][0]).toMatch(
        new RegExp(String.raw`^\[TIMING\] doc=1 stage=ocr ok in \d+ms$`),
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs a failure timing line and rethrows the original error', async () => {
      const logger = createLogger();
      const error = new Error('boom');

      await expect(
        timeStage(logger, 'doc=1 stage=bedrock', async () => {
          throw error;
        }),
      ).rejects.toBe(error);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toMatch(
        new RegExp(String.raw`^\[TIMING\] doc=1 stage=bedrock failed after \d+ms: boom$`),
      );
      expect(logger.log).not.toHaveBeenCalled();
    });

    it('measures elapsed time of the operation', async () => {
      const logger = createLogger();

      await timeStage(logger, 'sleep', () => new Promise((resolve) => setTimeout(resolve, 25)));

      const elapsed = Number(/ok in (\d+)ms/.exec(logger.log.mock.calls[0][0])?.[1]);
      expect(elapsed).toBeGreaterThanOrEqual(20);
    });
  });

  describe('describeQueueWait', () => {
    it('describes wait time between enqueue and processing start', () => {
      const text = describeQueueWait({ timestamp: 1_000, processedOn: 4_500, attemptsMade: 0 }, 9_999);

      expect(text).toBe(`${TIMING_LOG_PREFIX} queueWait=3500ms attempt=1`);
    });

    it('falls back to "now" when processedOn is missing', () => {
      const text = describeQueueWait({ timestamp: 1_000, attemptsMade: 2 }, 3_000);

      expect(text).toBe(`${TIMING_LOG_PREFIX} queueWait=2000ms attempt=3`);
    });

    it('reports unknown wait when timestamp is missing', () => {
      const text = describeQueueWait({}, 3_000);

      expect(text).toBe(`${TIMING_LOG_PREFIX} queueWait=unknown attempt=1`);
    });
  });
});
