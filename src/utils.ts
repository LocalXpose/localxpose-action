import * as core from '@actions/core';

/**
 * Safely get a boolean input, handling hyphenated input names
 *
 * GitHub Actions converts hyphens to underscores in environment variables,
 * but getBooleanInput doesn't handle this correctly. This function provides
 * a fallback to handle such cases.
 *
 * @param name The name of the input (can contain hyphens)
 * @param options Options for the input (e.g., required)
 * @returns The boolean value of the input
 */
export function getSafeBooleanInput(
  name: string,
  options?: core.InputOptions,
): boolean {
  try {
    return core.getBooleanInput(name, options);
  } catch (error) {
    // Fallback for hyphenated input names
    const value = core.getInput(name, options);

    // Handle empty string as false when not required
    if (!value && !options?.required) {
      return false;
    }

    // Parse common boolean representations
    const normalizedValue = value.toLowerCase().trim();
    return (
      normalizedValue === 'true' ||
      normalizedValue === '1' ||
      normalizedValue === 'yes'
    );
  }
}
