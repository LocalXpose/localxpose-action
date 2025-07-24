import * as core from '@actions/core';

/**
 * Sanitize log output to remove sensitive information
 */
export function sanitizeLogOutput(data: string, secrets: string[]): string {
  let sanitized = data;

  // First mask specific secrets ONLY - don't apply other patterns if secrets are provided
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      // Replace with asterisks, keeping first and last 2 chars for debugging
      const masked =
        secret.length > 4
          ? `${secret.slice(0, 2)}${'*'.repeat(secret.length - 4)}${secret.slice(-2)}`
          : '*'.repeat(secret.length);
      sanitized = sanitized.replace(
        new RegExp(escapeRegExp(secret), 'g'),
        masked,
      );
    }
  }

  // Only apply pattern-based masking if we're not already masking specific secrets
  if (secrets.length === 0) {
    // Environment variable patterns
    sanitized = sanitized.replace(/ACCESS_TOKEN=\S+/g, 'ACCESS_TOKEN=***');
    sanitized = sanitized.replace(
      /LX_ACCESS_TOKEN=\S+/g,
      'LX_ACCESS_TOKEN=***',
    );

    // Token patterns (case insensitive, but preserve original case)
    sanitized = sanitized.replace(
      /(token)["\s:=]+["']?([^"'\s]+)["']?/gi,
      '$1=***',
    );

    // Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+\S+/g, 'Bearer ***');
  }

  return sanitized;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate input to prevent command injection
 */
export function validateInput(
  input: string,
  pattern: RegExp,
  fieldName: string,
): void {
  if (!pattern.test(input)) {
    throw new Error(
      `Invalid ${fieldName}: ${input}. Must match pattern: ${pattern}`,
    );
  }
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  SUBDOMAIN: /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
  REGION: /^[a-z]{2}(-[a-z]+)?$/,
  PORT: /^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/,
  TYPE: /^(http|https|tcp|tls)$/,
  PACKAGE_NAME: /^[a-z0-9-]+$/,
};

/**
 * Mark secrets for masking in GitHub Actions logs
 */
export function maskSecrets(secrets: string[]): void {
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      core.setSecret(secret);
    }
  }
}
