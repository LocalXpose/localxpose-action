import * as core from '@actions/core';
import * as github from '@actions/github';

interface TunnelEntry {
  name: string;
  url: string;
  port: string;
  workflowRun: number;
  jobName: string;
  timestamp: string;
}

/**
 * Update a single PR comment with all tunnel information
 * @param tunnelUrl The public tunnel URL
 * @param githubToken GitHub token for API access
 * @param tunnelName Optional name for this tunnel
 */
export async function updatePRComment(
  tunnelUrl: string,
  githubToken: string,
  tunnelName?: string,
): Promise<void> {
  if (!github.context.payload.pull_request) {
    throw new Error('No pull request found in context');
  }

  const octokit = github.getOctokit(githubToken);
  const pullRequestNumber = github.context.payload.pull_request.number;
  const commentIdentifier = '<!-- localxpose-tunnels -->';

  try {
    // List existing comments
    const { data: comments } = await octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: pullRequestNumber,
    });

    // Find existing LocalXpose comment
    const existingComment = comments.find((comment) =>
      comment.body?.includes(commentIdentifier),
    );

    // Parse existing tunnels from comment
    const existingTunnels = existingComment
      ? parseExistingTunnels(existingComment.body || '')
      : [];

    // Add or update current tunnel
    const port = core.getInput('port');
    const currentTunnel: TunnelEntry = {
      name: tunnelName || `Port ${port}`,
      url: tunnelUrl,
      port,
      workflowRun: github.context.runNumber,
      jobName: github.context.job,
      timestamp: new Date().toISOString(),
    };

    // Update tunnels list (replace if same name/job, otherwise add)
    const updatedTunnels = updateTunnelsList(existingTunnels, currentTunnel);

    // Generate new comment body
    const commentBody = generateCommentBody(updatedTunnels);

    if (existingComment) {
      // Update existing comment
      core.info(`Updating existing comment ${existingComment.id}`);
      await octokit.rest.issues.updateComment({
        ...github.context.repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
    } else {
      // Create new comment
      core.info('Creating new PR comment');
      await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: pullRequestNumber,
        body: commentBody,
      });
    }

    core.info('Successfully updated tunnel information in PR');
  } catch (error) {
    throw new Error(
      `Failed to update PR comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parse existing tunnels from comment body
 */
function parseExistingTunnels(commentBody: string): TunnelEntry[] {
  // Look for JSON data block
  const jsonMatch = commentBody.match(/<!-- tunnels-data:(.*?)-->/s);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(Buffer.from(jsonMatch[1], 'base64').toString());
  } catch {
    return [];
  }
}

/**
 * Update tunnels list with new tunnel
 */
function updateTunnelsList(
  existing: TunnelEntry[],
  newTunnel: TunnelEntry,
): TunnelEntry[] {
  // Remove tunnels older than 20 minutes (accounting for 15-min expiry + buffer)
  const cutoffTime = new Date(Date.now() - 20 * 60 * 1000);
  const activeTunnels = existing.filter(
    (t) => new Date(t.timestamp) > cutoffTime,
  );

  // Replace tunnel with same name and job
  const filtered = activeTunnels.filter(
    (t) => !(t.name === newTunnel.name && t.jobName === newTunnel.jobName),
  );

  return [...filtered, newTunnel].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Generate the comment body with all tunnel information
 */
function generateCommentBody(tunnels: TunnelEntry[]): string {
  const timestamp = new Date().toISOString();
  const tunnelsData = Buffer.from(JSON.stringify(tunnels)).toString('base64');

  // Group by workflow run
  const byWorkflow = tunnels.reduce(
    (acc, tunnel) => {
      const key = tunnel.workflowRun;
      if (!acc[key]) acc[key] = [];
      acc[key].push(tunnel);
      return acc;
    },
    {} as Record<number, TunnelEntry[]>,
  );

  let body = `<!-- localxpose-tunnels -->
## 🚀 LocalXpose Preview Deployments

<!-- tunnels-data:${tunnelsData}-->

`;

  if (tunnels.length === 0) {
    body += '_No active tunnels_\n';
  } else {
    // Current workflow runs
    const currentRun = github.context.runNumber;
    if (byWorkflow[currentRun]) {
      body += '### 🟢 Current Workflow Run\n\n';
      body += generateTunnelTable(byWorkflow[currentRun]);
      delete byWorkflow[currentRun];
    }

    // Previous runs
    const otherRuns = Object.keys(byWorkflow)
      .map(Number)
      .sort((a, b) => b - a);

    if (otherRuns.length > 0) {
      body += '\n### ⏰ Previous Runs\n\n';
      for (const run of otherRuns) {
        body += `<details>\n<summary>Run #${run}</summary>\n\n`;
        body += generateTunnelTable(byWorkflow[run]);
        body += '\n</details>\n\n';
      }
    }
  }

  body += `
> **⚠️ Free Tier Notes:**
> - Tunnels expire after 15 minutes
> - HTTP only (no HTTPS/TCP/TLS)
> - Warning page on first visit

---
<sub>Last updated: ${timestamp} | [LocalXpose Action](https://github.com/marketplace/actions/localxpose-tunnel)</sub>`;

  return body;
}

/**
 * Generate markdown table for tunnels
 */
function generateTunnelTable(tunnels: TunnelEntry[]): string {
  let table = '| Service | URL | Port | Status |\n';
  table += '|---------|-----|------|--------|\n';

  for (const tunnel of tunnels) {
    const age = Date.now() - new Date(tunnel.timestamp).getTime();
    const ageMinutes = Math.floor(age / 60000);
    const isExpired = ageMinutes > 15;

    const status = isExpired
      ? '⏰ Expired'
      : ageMinutes > 12
        ? `⚠️ Expires soon (${15 - ageMinutes}m)`
        : '✅ Active';

    const url = isExpired
      ? `~~${tunnel.url}~~`
      : `[${tunnel.url}](${tunnel.url})`;

    table += `| ${tunnel.name} | ${url} | ${tunnel.port} | ${status} |\n`;
  }

  return table;
}
