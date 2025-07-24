import * as core from '@actions/core';

export interface RetryOptions {
  /** Maximum time to retry in milliseconds */
  timeout?: number;
  /** Delay between retries in milliseconds */
  delay?: number;
  /** Maximum number of retries (alternative to timeout) */
  maxRetries?: number;
  /** Function to get current time (for testing) */
  timeProvider?: () => number;
  /** Function to delay (for testing) */
  delayProvider?: (ms: number) => Promise<void>;
  /** Whether to log retry attempts */
  silent?: boolean;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly lastError?: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Retry a function until it succeeds or timeout/retries are exhausted
 * @param fn Function to retry
 * @param options Retry configuration
 * @returns Result of the function
 */
export async function retry<T>(
  fn: () => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const {
    timeout = 30000,
    delay = 500,
    maxRetries,
    timeProvider = Date.now,
    delayProvider = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    silent = false,
  } = options;

  const startTime = timeProvider();
  let lastError: Error | undefined;
  let attempts = 0;

  while (true) {
    attempts++;

    try {
      const result = await fn();
      if (attempts > 1 && !silent) {
        core.debug(`Retry succeeded after ${attempts} attempts`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const elapsedTime = timeProvider() - startTime;
      const shouldRetryByTimeout = elapsedTime < timeout;
      const shouldRetryByCount =
        maxRetries === undefined || attempts < maxRetries;

      if (!shouldRetryByTimeout || !shouldRetryByCount) {
        // We've exhausted our retries
        const reason = !shouldRetryByTimeout
          ? `timeout after ${timeout}ms`
          : `${maxRetries} retries`;

        throw new RetryError(
          `Failed after ${reason}: ${lastError.message}`,
          lastError,
        );
      }

      if (!silent) {
        core.debug(`Retry attempt ${attempts} failed: ${lastError.message}`);
      }

      // Wait before next retry
      await delayProvider(delay);
    }
  }
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry configuration (delay is initial delay)
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const initialDelay = options.delay || 500;
  let currentDelay = initialDelay;

  return retry(fn, {
    ...options,
    delayProvider: async (_ms) => {
      const actualDelay = currentDelay;
      currentDelay = Math.min(currentDelay * 2, 30000); // Cap at 30 seconds

      if (options.delayProvider) {
        return options.delayProvider(actualDelay);
      }
      return new Promise((resolve) => setTimeout(resolve, actualDelay));
    },
  });
}
