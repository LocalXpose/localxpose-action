import * as core from '@actions/core';
import { retry } from './retry';

/**
 * Verify that a tunnel URL is actually reachable
 * @param url The tunnel URL to verify
 * @param timeout Maximum time to wait for tunnel to be ready (ms)
 * @returns true if tunnel is reachable, false otherwise
 */
export async function verifyTunnelReachability(
  url: string,
  timeout: number = 30000,
): Promise<boolean> {
  core.info(`Verifying tunnel reachability: ${url}`);

  try {
    await retry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            // Don't follow redirects to detect LocalXpose pages
            redirect: 'manual',
          });

          clearTimeout(timeoutId);

          // Check for LocalXpose error pages
          if (response.status === 404) {
            // Try GET to see if it's LocalXpose's 404
            const getResponse = await fetch(url, {
              method: 'GET',
              signal: controller.signal,
            });
            const text = await getResponse.text();

            if (text.includes('<title>404 TUNNEL NOT FOUND</title>')) {
              throw new Error('LocalXpose returned: 404 TUNNEL NOT FOUND');
            }
          }

          // Success: 200-399 or redirect (300-399)
          if (
            response.ok ||
            (response.status >= 300 && response.status < 400)
          ) {
            core.info(`✅ Tunnel is reachable (status: ${response.status})`);
            return true;
          }

          // LocalXpose error pages
          if (response.status === 400 || response.status === 502) {
            const getResponse = await fetch(url);
            const text = await getResponse.text();

            if (text.match(/<title>\d{3}\s+[A-Z\s]+<\/title>/)) {
              throw new Error(`LocalXpose error: ${response.status}`);
            }
          }

          // Other non-success status
          throw new Error(`Tunnel returned status ${response.status}`);
        } catch (error) {
          clearTimeout(timeoutId);

          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timeout - tunnel not responding');
          }

          throw error;
        }
      },
      {
        timeout,
        maxRetries: 10,
        delay: 1000,
        silent: false,
      },
    );

    return true;
  } catch (error) {
    core.warning(`Tunnel verification failed: ${error}`);
    return false;
  }
}

/**
 * Wait for tunnel to be fully established and reachable
 * This is more reliable than just waiting for the URL to appear in logs
 */
export async function waitForTunnelReady(
  url: string,
  timeout: number = 30000,
): Promise<void> {
  const isReachable = await verifyTunnelReachability(url, timeout);

  if (!isReachable) {
    throw new Error(
      'Tunnel URL was generated but is not reachable. This may indicate a LocalXpose service issue.',
    );
  }
}
