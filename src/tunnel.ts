import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { retry, RetryError } from './retry';
import { waitForTunnelReady } from './tunnel-verify';

export interface TunnelOptions {
  port: number;
  type: string;
  region: string;
  subdomain?: string;
  token?: string;
}

export interface TunnelResult {
  url: string;
  hostname: string;
  pid: number;
  logPath: string;
}

/**
 * Create a LocalXpose tunnel
 * @param cliPath Path to the LocalXpose CLI
 * @param options Tunnel configuration options
 * @returns Tunnel information including URL and process ID
 */
export async function createTunnel(
  cliPath: string,
  options: TunnelOptions,
): Promise<TunnelResult> {
  const logPath = path.join(
    process.env.RUNNER_TEMP || '/tmp',
    `tunnel-${Date.now()}.log`,
  );
  const logStream = await fs.open(logPath, 'w');

  // Validate tunnel type
  if (options.type !== 'http') {
    core.warning(
      `Tunnel type '${options.type}' is not officially supported by this action. ` +
        `Only 'http' tunnels have been tested. Other LocalXpose tunnel types (tls, tcp, udp) ` +
        `may work but are not guaranteed.`,
    );
  }

  core.info(
    `Starting tunnel with command: ${cliPath} tunnel ${options.type} --to=${options.port}`,
  );

  // Build command arguments
  const args = ['tunnel', options.type, `--to=${options.port}`];

  if (options.region) {
    args.push(`--region=${options.region}`);
  }

  if (options.subdomain) {
    args.push(`--subdomain=${options.subdomain}`);
  }

  // Set up environment with token
  const env = { ...process.env };
  if (options.token) {
    env.LX_ACCESS_TOKEN = options.token;
  }

  // Spawn the tunnel process
  // On Unix, detached processes need to be in a new process group
  // Using 'inherit' for stderr to ensure error messages are visible
  const tunnelProcess = spawn(cliPath, args, {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Ensure the child can continue running after parent exits
    windowsHide: true, // Hide console window on Windows
  });

  if (!tunnelProcess.pid) {
    throw new Error('Failed to start tunnel process');
  }

  // Capture initial output to log file for URL extraction
  const stdoutHandler = async (data: Buffer): Promise<void> => {
    await logStream.write(data).catch(() => {}); // Ignore write errors after close
    core.debug(data.toString());
  };

  const stderrHandler = async (data: Buffer): Promise<void> => {
    await logStream.write(data).catch(() => {}); // Ignore write errors after close
    core.debug(data.toString());
  };

  tunnelProcess.stdout?.on('data', stdoutHandler);
  tunnelProcess.stderr?.on('data', stderrHandler);

  // Wait for tunnel to establish and extract URL
  const tunnelInfo = await waitForTunnel(logPath, tunnelProcess.pid);

  // Verify the tunnel is actually reachable
  core.info('Verifying tunnel is accessible...');
  await waitForTunnelReady(tunnelInfo.url, 30000);

  // Remove handlers before closing to prevent writes to closed stream
  tunnelProcess.stdout?.removeListener('data', stdoutHandler);
  tunnelProcess.stderr?.removeListener('data', stderrHandler);

  await logStream.close();

  // Continue logging to GitHub Actions debug log only
  // Using nextTick to ensure handlers are set after current I/O cycle
  process.nextTick(() => {
    tunnelProcess.stdout?.on('data', (data) => {
      core.debug(`[tunnel-stdout] ${data}`);
    });

    tunnelProcess.stderr?.on('data', (data) => {
      core.debug(`[tunnel-stderr] ${data}`);
    });
  });

  // Unref the process so the action can exit while tunnel keeps running
  tunnelProcess.unref();

  return {
    url: tunnelInfo.url,
    hostname: tunnelInfo.hostname,
    pid: tunnelProcess.pid,
    logPath,
  };
}

/**
 * Wait for tunnel to start, and extract the URL
 */
export async function waitForTunnel(
  logPath: string,
  pid: number,
  timeout = 30000,
): Promise<{ url: string; hostname: string }> {
  try {
    return await retry(
      async () => {
        const logContent = await fs.readFile(logPath, 'utf-8');

        // Extract hostname from log line like:
        // 2025/07/24 19:30:54 (http, us) msy1xmzeub.loclx.io => [running]
        const hostnameMatch = logContent.match(/([a-zA-Z0-9.-]+\.loclx\.io)/);

        if (hostnameMatch) {
          const hostname = hostnameMatch[1];
          const url = `https://${hostname}`;

          core.info(`Tunnel established: ${url}`);
          return { url, hostname };
        }

        // Check if process is still running
        try {
          process.kill(pid, 0); // signal 0 just checks if the process exists
        } catch {
          throw new Error('Tunnel process exited unexpectedly');
        }

        // No URL found yet, throw to retry
        throw new Error('Tunnel URL not found in log yet');
      },
      {
        timeout,
        delay: 500,
        silent: true,
      },
    );
  } catch (error) {
    if (error instanceof RetryError) {
      // Unwrap the retry error to provide better error message
      if (error.lastError?.message === 'Tunnel process exited unexpectedly') {
        throw error.lastError;
      }
      throw new Error(
        `Timeout waiting for tunnel to establish after ${timeout}ms`,
      );
    }
    throw error;
  }
}
