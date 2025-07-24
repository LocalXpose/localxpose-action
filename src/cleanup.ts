import * as core from '@actions/core';
import * as fs from 'fs/promises';

/**
 * Cleanup function that runs as a post-action
 * Kills the tunnel process and cleans up log files
 */
export async function cleanup(): Promise<void> {
  try {
    core.info('Running LocalXpose cleanup...');

    // Get saved state
    const tunnelPid = core.getState('tunnelPid');
    const tunnelLogPath = core.getState('tunnelLogPath');

    // Kill tunnel process if it exists
    if (tunnelPid) {
      try {
        const pid = parseInt(tunnelPid, 10);
        core.info(`Stopping tunnel process (PID: ${pid})...`);

        // Check if process exists before killing
        process.kill(pid, 0);

        // Send SIGINT first (same as Ctrl+C) for graceful shutdown
        // This allows LocalXpose to properly close connections
        process.kill(pid, 'SIGINT');
        core.debug('Sent SIGINT to tunnel process');

        // Give it time to terminate gracefully (important for reserved subdomains)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if still running
        try {
          process.kill(pid, 0);
          // Still running, try SIGTERM
          process.kill(pid, 'SIGTERM');
          core.debug('Sent SIGTERM to tunnel process');
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Final check
          try {
            process.kill(pid, 0);
            // Force kill as last resort
            process.kill(pid, 'SIGKILL');
            core.warning(
              'Had to force kill tunnel process - this may cause issues with reserved subdomains',
            );
          } catch {
            core.info('Tunnel process terminated after SIGTERM');
          }
        } catch {
          // Process terminated after SIGINT
          core.info('Tunnel process terminated gracefully');
        }
      } catch (error) {
        // Process doesn't exist or already terminated
        core.info('Tunnel process already stopped');
      }
    }

    // Clean up log file
    if (tunnelLogPath) {
      try {
        await fs.unlink(tunnelLogPath);
        core.info(`Cleaned up log file: ${tunnelLogPath}`);
      } catch (error) {
        core.debug(`Failed to clean up log file: ${error}`);
      }
    }

    core.info('✅ LocalXpose cleanup completed');
  } catch (error) {
    // Don't fail the workflow if cleanup fails
    core.warning(
      `Cleanup error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Export cleanup function for use in index.ts
export default cleanup;
