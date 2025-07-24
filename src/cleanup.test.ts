import * as core from '@actions/core';
import * as fs from 'fs/promises';
import { cleanup } from './cleanup';

jest.mock('@actions/core');
jest.mock('fs/promises');

describe('cleanup', () => {
  let mockKill: jest.Mock;
  let originalKill: typeof process.kill;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock process.kill
    originalKill = process.kill;
    mockKill = jest.fn();
    process.kill = mockKill as any;

    // Mock core.getState
    const mockGetState = core.getState as jest.MockedFunction<
      typeof core.getState
    >;
    mockGetState.mockImplementation((name: string) => {
      if (name === 'tunnelPid') return '12345';
      if (name === 'tunnelLogPath') return '/tmp/tunnel.log';
      return '';
    });
  });

  afterEach(() => {
    process.kill = originalKill;
    jest.useRealTimers();
  });

  describe('Process Cleanup', () => {
    it('should attempt graceful shutdown with SIGINT first', async () => {
      // Process exists but dies after SIGINT
      let alive = true;
      mockKill.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (!alive) throw new Error('Process not found');
          return true;
        }
        if (signal === 'SIGINT') {
          alive = false;
          return true;
        }
      });

      const cleanupPromise = cleanup();

      // Should check if process exists
      expect(mockKill).toHaveBeenCalledWith(12345, 0);

      // Should send SIGINT
      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGINT');

      // Advance timer to skip the 2s wait
      jest.advanceTimersByTime(2000);

      await cleanupPromise;

      expect(core.info).toHaveBeenCalledWith(
        'Tunnel process terminated gracefully',
      );
    });

    it('should escalate to SIGKILL if process still running after timeout', async () => {
      // Process never dies
      mockKill.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) return true;
        if (signal === 'SIGINT') return true;
        if (signal === 'SIGTERM') return true;
        if (signal === 'SIGKILL') return true;
        return true;
      });

      const cleanupPromise = cleanup();

      // Wait for promise to be created, then advance timers
      await Promise.resolve();

      // Advance through all timeouts
      jest.advanceTimersByTime(2000); // After SIGINT
      await Promise.resolve();
      jest.advanceTimersByTime(1000); // After SIGTERM
      await Promise.resolve();

      await cleanupPromise;

      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGINT');
      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGKILL');
      expect(core.warning).toHaveBeenCalledWith(
        'Had to force kill tunnel process - this may cause issues with reserved subdomains',
      );
    });

    it('should handle process already dead', async () => {
      mockKill.mockImplementation(() => {
        throw new Error('Process not found');
      });

      await cleanup();

      expect(core.info).toHaveBeenCalledWith('Tunnel process already stopped');
    });

    it('should handle process exit after SIGTERM', async () => {
      // The process stays alive through SIGINT and dies after SIGTERM
      let signalsSent: string[] = [];
      mockKill.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) {
          // Check if process should be dead based on signals sent
          if (signalsSent.includes('SIGTERM')) {
            throw new Error('Process not found');
          }
          return true;
        }
        if (signal === 'SIGINT' || signal === 'SIGTERM') {
          signalsSent.push(signal as string);
          return true;
        }
        return true;
      });

      // Start cleanup
      cleanup();

      // Run all timers synchronously
      await jest.runAllTimersAsync();

      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(core.info).toHaveBeenCalledWith(
        'Tunnel process terminated after SIGTERM',
      );
    });

    it('should handle non-numeric PID', async () => {
      const mockGetState = core.getState as jest.MockedFunction<
        typeof core.getState
      >;
      mockGetState.mockImplementation((name: string) => {
        if (name === 'tunnelPid') return 'invalid';
        if (name === 'tunnelLogPath') return '/tmp/tunnel.log';
        return '';
      });

      // parseInt('invalid') returns NaN, process.kill(NaN) throws
      mockKill.mockImplementation(() => {
        throw new Error('Invalid PID');
      });

      const cleanupPromise = cleanup();
      jest.runAllTimers();
      await cleanupPromise;

      // Should log as 'Tunnel process already stopped' because kill failed
      expect(core.info).toHaveBeenCalledWith('Tunnel process already stopped');
    });

    it('should handle empty PID', async () => {
      const mockGetState = core.getState as jest.MockedFunction<
        typeof core.getState
      >;
      mockGetState.mockImplementation(() => '');

      await cleanup();

      expect(mockKill).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('✅ LocalXpose cleanup completed');
    });
  });

  describe('Log File Cleanup', () => {
    it('should remove log file if it exists', async () => {
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
      mockKill.mockImplementation(() => {
        throw new Error('Process not found');
      });

      await cleanup();

      expect(mockUnlink).toHaveBeenCalledWith('/tmp/tunnel.log');
      expect(core.info).toHaveBeenCalledWith(
        'Cleaned up log file: /tmp/tunnel.log',
      );
    });

    it('should handle log file not found', async () => {
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
      mockUnlink.mockRejectedValue(new Error('ENOENT'));
      mockKill.mockImplementation(() => {
        throw new Error('Process not found');
      });

      await cleanup();

      expect(mockUnlink).toHaveBeenCalledWith('/tmp/tunnel.log');
      expect(core.debug).toHaveBeenCalledWith(
        'Failed to clean up log file: Error: ENOENT',
      );
    });

    it('should handle missing log path', async () => {
      const mockGetState = core.getState as jest.MockedFunction<
        typeof core.getState
      >;
      mockGetState.mockImplementation((name: string) => {
        if (name === 'tunnelPid') return '12345';
        return '';
      });
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

      // Process exists and needs cleanup
      let alive = true;
      mockKill.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (!alive) throw new Error('Process not found');
          return true;
        }
        if (signal === 'SIGINT') {
          alive = false;
          return true;
        }
      });

      const cleanupPromise = cleanup();
      jest.advanceTimersByTime(2000);
      await cleanupPromise;

      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should not throw on cleanup errors', async () => {
      const mockGetState = core.getState as jest.MockedFunction<
        typeof core.getState
      >;
      mockGetState.mockImplementation(() => {
        throw new Error('State error');
      });

      // Should not throw
      await expect(cleanup()).resolves.toBeUndefined();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup error:'),
      );
    });

    it('should handle process cleanup errors gracefully', async () => {
      // Force an error in the outer try block
      const mockGetState = core.getState as jest.MockedFunction<
        typeof core.getState
      >;
      mockGetState.mockImplementation((name) => {
        if (name === 'tunnelPid') return '12345';
        if (name === 'tunnelLogPath') return {} as any; // This will cause an error in fs.unlink
        return '';
      });

      // Process handling should work
      mockKill.mockImplementation(() => {
        throw new Error('Process not found');
      });

      // Mock fs.unlink to throw on invalid input
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
      mockUnlink.mockRejectedValue(new Error('Invalid path'));

      await cleanup();

      // Should complete without throwing
      expect(core.info).toHaveBeenCalledWith('✅ LocalXpose cleanup completed');
    });
  });

  describe('Complete Flow', () => {
    it('should complete full cleanup successfully', async () => {
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

      // Process dies after SIGINT
      let alive = true;
      mockKill.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (!alive) throw new Error('Process not found');
          return true;
        }
        if (signal === 'SIGINT') {
          alive = false;
          return true;
        }
      });

      const cleanupPromise = cleanup();
      jest.advanceTimersByTime(2000);
      await cleanupPromise;

      expect(core.info).toHaveBeenCalledWith('Running LocalXpose cleanup...');
      expect(core.info).toHaveBeenCalledWith(
        'Stopping tunnel process (PID: 12345)...',
      );
      expect(core.info).toHaveBeenCalledWith(
        'Tunnel process terminated gracefully',
      );
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/tunnel.log');
      expect(core.info).toHaveBeenCalledWith('✅ LocalXpose cleanup completed');
    });

    it('should show all info messages in order when process already stopped', async () => {
      mockKill.mockImplementation(() => {
        throw new Error('Already dead');
      });
      const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
      // Mock successful unlink
      mockUnlink.mockResolvedValue(undefined);

      await cleanup();

      const infoMessages = (
        core.info as jest.MockedFunction<typeof core.info>
      ).mock.calls.map((call) => call[0]);

      expect(infoMessages).toEqual([
        'Running LocalXpose cleanup...',
        'Stopping tunnel process (PID: 12345)...',
        'Tunnel process already stopped',
        'Cleaned up log file: /tmp/tunnel.log',
        '✅ LocalXpose cleanup completed',
      ]);
    });
  });
});
