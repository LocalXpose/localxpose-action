import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as os from 'os';
import * as fs from 'fs/promises';
import { installLocalXpose } from '../src/installer';

jest.mock('@actions/core');
jest.mock('@actions/tool-cache');
jest.mock('@actions/exec');
jest.mock('os');
jest.mock('fs/promises');

describe('installer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('installLocalXpose', () => {
    it('should use cached version if available', async () => {
      const mockFind = tc.find as jest.MockedFunction<typeof tc.find>;
      mockFind.mockReturnValue('/cached/path');

      const result = await installLocalXpose();

      expect(result).toBe('/cached/path/loclx');
      expect(mockFind).toHaveBeenCalledWith('localxpose', 'latest');
    });

    it('should use direct download on Linux', async () => {
      const mockFind = tc.find as jest.MockedFunction<typeof tc.find>;
      mockFind.mockReturnValue('');

      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(os, 'arch').mockReturnValue('x64');

      const mockDownloadTool = tc.downloadTool as jest.MockedFunction<
        typeof tc.downloadTool
      >;
      mockDownloadTool.mockResolvedValue('/tmp/loclx.zip');

      const mockExtractZip = tc.extractZip as jest.MockedFunction<
        typeof tc.extractZip
      >;
      mockExtractZip.mockResolvedValue('/tmp/extracted');

      const mockCacheDir = tc.cacheDir as jest.MockedFunction<
        typeof tc.cacheDir
      >;
      mockCacheDir.mockResolvedValue('/home/runner/.cache/loclx');

      const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
      mockExec.mockResolvedValue(0);

      const mockChmod = fs.chmod as jest.MockedFunction<typeof fs.chmod>;
      mockChmod.mockResolvedValue();

      const result = await installLocalXpose();

      expect(mockDownloadTool).toHaveBeenCalledWith(
        'https://api.localxpose.io/api/downloads/loclx-linux-amd64.zip',
      );
      expect(mockExtractZip).toHaveBeenCalledWith('/tmp/loclx.zip');
      expect(mockChmod).toHaveBeenCalledWith('/tmp/extracted/loclx', 0o755);
      expect(result).toBe('/home/runner/.cache/loclx/loclx');
    });

    it('should throw error if installation fails', async () => {
      const mockFind = tc.find as jest.MockedFunction<typeof tc.find>;
      mockFind.mockReturnValue('');

      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(os, 'arch').mockReturnValue('x64');

      const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
      mockExec.mockRejectedValue(new Error('Snap installation failed'));

      // Mock downloadBinary to also fail
      const mockDownloadTool = tc.downloadTool as jest.MockedFunction<
        typeof tc.downloadTool
      >;
      mockDownloadTool.mockRejectedValue(new Error('Download failed'));

      await expect(installLocalXpose()).rejects.toThrow(
        'Failed to download LocalXpose: Download failed',
      );
    });

    it('should use direct download for macOS and Windows', async () => {
      const mockFind = tc.find as jest.MockedFunction<typeof tc.find>;
      mockFind.mockReturnValue('');

      // Mock for macOS
      jest.spyOn(os, 'platform').mockReturnValue('darwin');
      jest.spyOn(os, 'arch').mockReturnValue('x64');

      const mockDownloadTool = tc.downloadTool as jest.MockedFunction<
        typeof tc.downloadTool
      >;
      mockDownloadTool.mockResolvedValue('/tmp/localxpose.zip');

      const mockExtractZip = tc.extractZip as jest.MockedFunction<
        typeof tc.extractZip
      >;
      mockExtractZip.mockResolvedValue('/tmp/extracted');

      const mockCacheDir = tc.cacheDir as jest.MockedFunction<
        typeof tc.cacheDir
      >;
      mockCacheDir.mockResolvedValue('/cached/path');

      const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
      mockExec.mockResolvedValue(0);

      const result = await installLocalXpose();

      expect(mockDownloadTool).toHaveBeenCalledWith(
        'https://api.localxpose.io/api/downloads/loclx-darwin-amd64.zip',
      );
      expect(result).toBe('/cached/path/loclx');
    });

    it('should throw error if binary not found after installation', async () => {
      const mockFind = tc.find as jest.MockedFunction<typeof tc.find>;
      mockFind.mockReturnValue('');

      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(os, 'arch').mockReturnValue('x64');

      const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
      mockExec.mockImplementation(
        async (cmd: string, args?: string[], options?: any) => {
          if (cmd === 'which') {
            // Return empty for both attempts
            if (options?.listeners?.stdout) {
              options.listeners.stdout(Buffer.from(''));
            }
          }
          return 0;
        },
      );

      // Mock downloadBinary to also fail when binary not found
      const mockDownloadTool = tc.downloadTool as jest.MockedFunction<
        typeof tc.downloadTool
      >;
      mockDownloadTool.mockRejectedValue(
        new Error('Failed to find LocalXpose binary after installation'),
      );

      await expect(installLocalXpose()).rejects.toThrow(
        'Failed to download LocalXpose: Failed to find LocalXpose binary after installation',
      );
    });
  });
});
