import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

const TOOL_NAME = 'localxpose';

/**
 * Installs LocalXpose CLI using direct download for all platforms
 * @returns Path to the installed CLI binary
 */
export async function installLocalXpose(): Promise<string> {
  // Check if already in tool cache
  const cachedPath = tc.find(TOOL_NAME, 'latest');
  if (cachedPath) {
    core.info(`Found cached LocalXpose at ${cachedPath}`);
    return path.join(cachedPath, 'loclx');
  }

  // Detect platform
  const platform = os.platform();

  switch (platform) {
    case 'linux':
    case 'darwin':
    case 'win32':
      // Use direct download for all platforms
      return await downloadBinary();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Download LocalXpose binary directly
 */
async function downloadBinary(): Promise<string> {
  const platform = os.platform(); // 'aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', and 'win32'
  const arch = os.arch(); // 'arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', and 'x64'

  // Map Node.js platform to LocalXpose (go)
  const platformMap: Record<string, string> = {
    darwin: 'darwin',
    freebsd: 'freebsd',
    linux: 'linux',
    win32: 'windows',
  };

  // Map Node.js arch to LocalXpose (go)
  const archMap: Record<string, string> = {
    x64: 'amd64',
    arm64: 'arm64',
    ia32: '386',
    x32: '386',
    arm: 'arm',
  };

  const lxPlatform = platformMap[platform];
  const lxArch = archMap[arch] || arch;

  if (!lxPlatform) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Validate combination is supported based on known releases
  const supportedCombos: Record<string, string[]> = {
    darwin: ['amd64', 'arm64'],
    freebsd: ['386', 'amd64', 'arm', 'arm64'],
    windows: ['386', 'amd64'],
    linux: [
      '386',
      'amd64',
      'arm',
      'arm64',
      'mips',
      'mips64',
      'mips64le',
      'mipsle',
      'ppc64',
      'ppc64le',
      's390x',
    ],
  };

  if (!supportedCombos[lxPlatform]?.includes(lxArch)) {
    throw new Error(
      `Unsupported platform/architecture combination: ${lxPlatform}-${lxArch}. Let us know: hello@localxpose.io!`,
    );
  }

  const downloadUrl = `https://api.localxpose.io/api/downloads/loclx-${lxPlatform}-${lxArch}.zip`;
  core.info(`Downloading LocalXpose from ${downloadUrl}...`);

  try {
    // Download the zip file
    const zipPath = await tc.downloadTool(downloadUrl);

    // Extract the zip
    const extractedPath = await tc.extractZip(zipPath);

    // Find the binary
    const binaryName = platform === 'win32' ? 'loclx.exe' : 'loclx';
    const binaryPath = path.join(extractedPath, binaryName);

    // Make it executable on Unix-like systems
    if (platform !== 'win32') {
      await fs.chmod(binaryPath, 0o755);
    }

    // Verify it works
    await exec.exec(binaryPath, ['-h'], { silent: true });

    // Cache it
    const cachedDir = await tc.cacheDir(extractedPath, TOOL_NAME, 'latest');
    const finalPath = path.join(cachedDir, binaryName);

    core.info(`LocalXpose installed successfully at ${finalPath}`);
    return finalPath;
  } catch (error) {
    throw new Error(
      `Failed to download LocalXpose: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
