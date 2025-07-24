import * as core from '@actions/core';
import { retry, retryWithBackoff, RetryError } from './retry';

jest.mock('@actions/core');

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retry function', () => {
    it('should return immediately on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const mockTime = jest.fn().mockReturnValue(0);
      const mockDelay = jest.fn().mockResolvedValue(undefined);

      const result = await retry(fn, {
        timeProvider: mockTime,
        delayProvider: mockDelay,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(500);
    });

    it('should throw RetryError on timeout', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      let currentTime = 0;
      const mockTime = jest.fn(() => currentTime);
      const mockDelay = jest.fn(async (ms) => {
        currentTime += ms;
      });

      await expect(
        retry(fn, {
          timeout: 1000,
          delay: 400,
          timeProvider: mockTime,
          delayProvider: mockDelay,
        }),
      ).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries (at 0ms, 400ms, 800ms, 1200ms)
    });

    it('should respect maxRetries option', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));
      const mockDelay = jest.fn().mockResolvedValue(undefined);

      await expect(
        retry(fn, {
          maxRetries: 3,
          delayProvider: mockDelay,
        }),
      ).rejects.toThrow('Failed after 3 retries');

      expect(fn).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledTimes(2);
    });

    it('should work with synchronous functions', async () => {
      let attempts = 0;
      const fn = jest.fn(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`attempt ${attempts}`);
        }
        return 'success';
      });

      const mockDelay = jest.fn().mockResolvedValue(undefined);

      const result = await retry(fn, {
        delayProvider: mockDelay,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should preserve the last error in RetryError', async () => {
      const lastError = new Error('final error');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('first error'))
        .mockRejectedValue(lastError);

      const mockTime = jest.fn().mockReturnValue(0);
      const mockDelay = jest.fn().mockResolvedValue(undefined);

      try {
        await retry(fn, {
          maxRetries: 2,
          timeProvider: mockTime,
          delayProvider: mockDelay,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).lastError).toBe(lastError);
        expect((error as RetryError).message).toContain('final error');
      }
    });

    it('should respect silent option', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const mockDelay = jest.fn().mockResolvedValue(undefined);
      const mockDebug = core.debug as jest.MockedFunction<typeof core.debug>;

      await retry(fn, {
        silent: true,
        delayProvider: mockDelay,
      });

      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('should log debug messages when not silent', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const mockDelay = jest.fn().mockResolvedValue(undefined);
      const mockDebug = core.debug as jest.MockedFunction<typeof core.debug>;

      await retry(fn, {
        silent: false,
        delayProvider: mockDelay,
      });

      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt 1 failed'),
      );
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining('Retry succeeded after 2 attempts'),
      );
    });
  });

  describe('retryWithBackoff', () => {
    it('should use exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const mockDelay = jest.fn(async (ms) => {
        delays.push(ms);
      });

      const result = await retryWithBackoff(fn, {
        delay: 100,
        delayProvider: mockDelay,
      });

      expect(result).toBe('success');
      expect(delays).toEqual([100, 200, 400]);
    });

    it('should cap backoff at 30 seconds', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      const delays: number[] = [];
      const mockDelay = jest.fn(async (ms) => {
        delays.push(ms);
        if (delays.length >= 10) {
          throw new Error('Too many retries in test');
        }
      });

      try {
        await retryWithBackoff(fn, {
          delay: 10000, // Start at 10 seconds
          timeout: 100, // Quick timeout to avoid long test
          delayProvider: mockDelay,
        });
      } catch (error) {
        // Expected to fail
      }

      expect(delays[0]).toBe(10000);
      expect(delays[1]).toBe(20000);
      expect(delays[2]).toBe(30000); // Should be capped
    });

    it('should respect custom delay provider', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      let customDelayCallCount = 0;
      const customDelay = jest.fn(async (ms) => {
        customDelayCallCount++;
        // Custom logic
      });

      await retryWithBackoff(fn, {
        delay: 100,
        delayProvider: customDelay,
      });

      expect(customDelayCallCount).toBe(1);
      expect(customDelay).toHaveBeenCalledWith(100);
    });
  });
});
