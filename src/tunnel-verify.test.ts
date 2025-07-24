import * as core from '@actions/core';
import { verifyTunnelReachability, waitForTunnelReady } from './tunnel-verify';
import { retry, RetryError } from './retry';

jest.mock('@actions/core');
jest.mock('./retry');

// Mock global fetch
global.fetch = jest.fn();

describe('tunnel-verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('verifyTunnelReachability', () => {
    it('should return true when tunnel responds with 200', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        return await fn();
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await verifyTunnelReachability('https://test.loclx.io');

      expect(result).toBe(true);
      expect(core.info).toHaveBeenCalledWith(
        'Verifying tunnel reachability: https://test.loclx.io',
      );
      expect(core.info).toHaveBeenCalledWith(
        '✅ Tunnel is reachable (status: 200)',
      );
    });

    it('should return true when tunnel responds with redirect', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        return await fn();
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 302,
      });

      const result = await verifyTunnelReachability('https://test.loclx.io');

      expect(result).toBe(true);
      expect(core.info).toHaveBeenCalledWith(
        '✅ Tunnel is reachable (status: 302)',
      );
    });

    it('should detect LocalXpose 404 error page', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (error) {
          throw new RetryError('Retry failed', error as Error);
        }
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => '<title>404 TUNNEL NOT FOUND</title>',
        });

      const result = await verifyTunnelReachability('https://test.loclx.io');

      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Tunnel verification failed'),
      );
    });

    it('should detect LocalXpose error pages', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (error) {
          throw new RetryError('Retry failed', error as Error);
        }
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => '<title>502 BAD GATEWAY</title>',
        });

      const result = await verifyTunnelReachability('https://test.loclx.io');

      expect(result).toBe(false);
    });

    it('should handle request timeout', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (error) {
          throw new RetryError('Retry failed', error as Error);
        }
      });

      (global.fetch as jest.Mock).mockImplementation(() => {
        const error = new Error('Request aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await verifyTunnelReachability(
        'https://test.loclx.io',
        1000,
      );

      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Tunnel verification failed'),
      );
    });

    it('should handle network errors', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (error) {
          throw new RetryError('Retry failed', error as Error);
        }
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await verifyTunnelReachability('https://test.loclx.io');

      expect(result).toBe(false);
    });
  });

  describe('waitForTunnelReady', () => {
    it('should complete when tunnel is reachable', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        return await fn();
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await expect(
        waitForTunnelReady('https://test.loclx.io'),
      ).resolves.toBeUndefined();
    });

    it('should throw when tunnel is not reachable', async () => {
      const mockRetry = retry as jest.MockedFunction<typeof retry>;
      mockRetry.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (error) {
          throw new RetryError('Retry failed', error as Error);
        }
      });

      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(waitForTunnelReady('https://test.loclx.io')).rejects.toThrow(
        'Tunnel URL was generated but is not reachable',
      );
    });
  });
});
