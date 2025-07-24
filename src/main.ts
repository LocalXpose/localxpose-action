import * as core from '@actions/core';
import * as github from '@actions/github';
import { installLocalXpose } from './installer';
import { createTunnel, TunnelOptions } from './tunnel';
import { updatePRComment } from './pr-comment';
import { getSafeBooleanInput } from './utils';

/**
 * Main entry point for the LocalXpose GitHub Action
 */
export async function run(): Promise<void> {
  try {
    // Get inputs
    const port = core.getInput('port', { required: true });
    const token = core.getInput('token') || process.env.LX_ACCESS_TOKEN || '';
    const type = core.getInput('type') || 'http';
    const region = core.getInput('region') || 'us';
    const subdomain = core.getInput('subdomain');
    const prComment = getSafeBooleanInput('pr-comment', { required: false });
    const githubToken = core.getInput('github-token');
    const prCommentName = core.getInput('pr-comment-name');

    // Validate inputs
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(`Invalid port: ${port}. Must be between 1 and 65535.`);
    }

    // Install LocalXpose CLI
    core.info('Installing LocalXpose CLI...');
    const cliPath = await installLocalXpose();
    core.info(`LocalXpose CLI installed at: ${cliPath}`);

    // Create tunnel
    core.info(`Creating ${type} tunnel for port ${port}...`);
    const tunnelOptions: TunnelOptions = {
      port: portNum,
      type,
      region,
      subdomain,
      token,
    };

    const tunnel = await createTunnel(cliPath, tunnelOptions);

    // Set outputs
    core.setOutput('url', tunnel.url);
    core.setOutput('hostname', tunnel.hostname);
    core.setOutput('status', 'running');

    // Display tunnel information
    core.info('✅ Tunnel created successfully!');
    core.info(`🌐 URL: ${tunnel.url}`);
    core.info(`🔗 Hostname: ${tunnel.hostname}`);

    // Create PR comment if requested
    if (prComment && github.context.eventName === 'pull_request') {
      try {
        await updatePRComment(tunnel.url, githubToken, prCommentName);
        core.info('✅ Posted tunnel URL to PR');
      } catch (error) {
        // Don't fail the action if PR comment fails
        core.warning(
          `Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Save state for post-action cleanup
    core.saveState('tunnelPid', tunnel.pid.toString());
    core.saveState('tunnelLogPath', tunnel.logPath);

    // Note: The tunnel process will continue running after this action completes
    // It will be cleaned up during the post-action phase
    core.info(`Tunnel process PID: ${tunnel.pid}`);
    core.info('Tunnel will remain active for subsequent steps');

    // For reserved subdomains: The post-action will attempt graceful shutdown
    if (subdomain) {
      core.info(
        'Note: Using reserved subdomain - graceful shutdown will be attempted',
      );
    }

    // Debug: Log that we're about to return from run()
    core.debug('Main action run() completing...');
  } catch (error) {
    core.setOutput('status', 'failed');
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
