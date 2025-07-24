import * as core from '@actions/core';
import { run } from './main';
import { cleanup } from './cleanup';

/**
 * Main entry point that handles both main action and post-action cleanup
 */
async function runAction(): Promise<void> {
  // Check cleanup flag has been set for this workflow
  if (core.getState('isPost')) {
    // Running as post-action
    await cleanup();
  } else {
    // Running as main action
    core.saveState('isPost', 'true'); // Set cleanup flag
    await run();
  }
}

// Execute the action
runAction()
  .then(() => {
    console.log('Action completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Action failed:', error);
    process.exit(1);
  });
