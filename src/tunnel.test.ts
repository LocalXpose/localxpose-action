import * as core from '@actions/core';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { createTunnel, TunnelOptions, waitForTunnel } from '../src/tunnel';
import { EventEmitter } from 'events';

jest.mock('@actions/core');
jest.mock('fs/promises');
jest.mock('child_process');
jest.mock('../src/tunnel-verify', () => ({
  waitForTunnelReady: jest.fn().mockResolvedValue(true),
}));

describe('tunnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RUNNER_TEMP = '/tmp/runner';
  });

  describe('createTunnel', () => {
    it('should create a tunnel successfully', async () => {
      const mockLogHandle = {
        write: jest.fn(),
        close: jest.fn(),
      };
      const mockOpen = fs.open as jest.MockedFunction<typeof fs.open>;
      mockOpen.mockResolvedValue(mockLogHandle as any);

      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;
      mockReadFile.mockResolvedValue(
        '2025/07/24 19:30:54 (http, us) test123.loclx.io => [running]\n',
      );

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.unref = jest.fn();

      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      mockSpawn.mockReturnValue(mockProcess);

      const options: TunnelOptions = {
        port: 3000,
        type: 'http',
        region: 'us',
      };

      const resultPromise = createTunnel('/path/to/loclx', options);

      // Simulate some output
      mockProcess.stdout.emit('data', Buffer.from('Starting tunnel...'));

      const result = await resultPromise;

      expect(result).toEqual({
        url: 'https://test123.loclx.io',
        hostname: 'test123.loclx.io',
        pid: 12345,
        logPath: expect.stringContaining('tunnel-'),
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/path/to/loclx',
        ['tunnel', 'http', '--to=3000', '--region=us'],
        expect.objectContaining({
          env: expect.objectContaining(process.env),
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('should include subdomain if provided', async () => {
      const mockLogHandle = {
        write: jest.fn(),
        close: jest.fn(),
      };
      const mockOpen = fs.open as jest.MockedFunction<typeof fs.open>;
      mockOpen.mockResolvedValue(mockLogHandle as any);

      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;
      mockReadFile.mockResolvedValue('custom.loclx.io => [running]\n');

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.unref = jest.fn();

      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      mockSpawn.mockReturnValue(mockProcess);

      const options: TunnelOptions = {
        port: 8080,
        type: 'http',
        region: 'eu',
        subdomain: 'custom',
      };

      await createTunnel('/path/to/loclx', options);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/path/to/loclx',
        ['tunnel', 'http', '--to=8080', '--region=eu', '--subdomain=custom'],
        expect.any(Object),
      );
    });

    it('should pass token via environment', async () => {
      const mockLogHandle = {
        write: jest.fn(),
        close: jest.fn(),
      };
      const mockOpen = fs.open as jest.MockedFunction<typeof fs.open>;
      mockOpen.mockResolvedValue(mockLogHandle as any);

      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;
      mockReadFile.mockResolvedValue('test.loclx.io => [running]\n');

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.unref = jest.fn();

      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      mockSpawn.mockReturnValue(mockProcess);

      const options: TunnelOptions = {
        port: 3000,
        type: 'http',
        region: 'us',
        token: 'secret-token',
      };

      await createTunnel('/path/to/loclx', options);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/path/to/loclx',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            LX_ACCESS_TOKEN: 'secret-token',
          }),
        }),
      );
    });

    it('should throw error if process fails to start', async () => {
      const mockLogHandle = {
        write: jest.fn(),
        close: jest.fn(),
      };
      const mockOpen = fs.open as jest.MockedFunction<typeof fs.open>;
      mockOpen.mockResolvedValue(mockLogHandle as any);

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = undefined; // No PID
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      mockSpawn.mockReturnValue(mockProcess);

      const options: TunnelOptions = {
        port: 3000,
        type: 'http',
        region: 'us',
      };

      await expect(createTunnel('/path/to/loclx', options)).rejects.toThrow(
        'Failed to start tunnel process',
      );
    });

    it('should timeout if tunnel URL not found', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;
      mockReadFile.mockResolvedValue('Starting tunnel...\n'); // No URL in log

      // Mock process.kill to indicate process is running
      const originalKill = process.kill;
      process.kill = jest.fn().mockImplementation((pid, signal) => {
        if (signal === 0) return true;
        return originalKill(pid, signal);
      });

      await expect(waitForTunnel('/tmp/test.log', 12345, 100)) // Very short timeout for test
        .rejects.toThrow('Timeout waiting for tunnel to establish after 100ms');

      process.kill = originalKill;
    });

    it('should throw error if process exits unexpectedly', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;

      // First call succeeds (file exists), subsequent calls also succeed
      mockReadFile.mockResolvedValue('Starting tunnel...\n');

      // Mock process.kill to throw (process not found) on first call
      const originalKill = process.kill;
      process.kill = jest.fn().mockImplementation((pid, signal) => {
        if (signal === 0) {
          throw new Error('Process not found');
        }
        return true;
      });

      // With the new retry implementation, process exit errors should be properly thrown
      await expect(waitForTunnel('/tmp/test.log', 12345, 100)).rejects.toThrow(
        'Tunnel process exited unexpectedly',
      );

      process.kill = originalKill;
    });

    it('should warn for non-HTTP tunnel types', async () => {
      const mockLogHandle = {
        write: jest.fn(),
        close: jest.fn(),
      };
      const mockOpen = fs.open as jest.MockedFunction<typeof fs.open>;
      mockOpen.mockResolvedValue(mockLogHandle as any);

      const mockReadFile = fs.readFile as jest.MockedFunction<
        typeof fs.readFile
      >;
      // Even for TCP tunnels, we'll simulate it as if it returns a hostname for testing
      // In reality TCP tunnels return IP:port, but our test is just checking the warning
      mockReadFile.mockResolvedValue(
        '2025/07/24 19:30:54 (tcp, us) test123.loclx.io => [running]\n',
      );

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.unref = jest.fn();

      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
      mockSpawn.mockReturnValue(mockProcess);

      const mockWarning = core.warning as jest.MockedFunction<
        typeof core.warning
      >;

      const options: TunnelOptions = {
        port: 3000,
        type: 'tcp',
        region: 'us',
      };

      const resultPromise = createTunnel('/path/to/loclx', options);

      // Simulate some output
      mockProcess.stdout.emit('data', Buffer.from('Starting tunnel...'));

      await resultPromise;

      expect(mockWarning).toHaveBeenCalledWith(
        expect.stringContaining(
          "Tunnel type 'tcp' is not officially supported by this action",
        ),
      );
    });
  });
});
