import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from '../src/main';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('../src/installer');
jest.mock('../src/tunnel');
jest.mock('../src/pr-comment');
jest.mock('../src/utils');

describe('LocalXpose Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.LX_ACCESS_TOKEN;

    // Default mock for getSafeBooleanInput
    const { getSafeBooleanInput } = require('../src/utils');
    getSafeBooleanInput.mockReturnValue(false);
  });

  it('should create a tunnel successfully', async () => {
    // Mock inputs
    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
      typeof core.getBooleanInput
    >;

    mockGetInput.mockImplementation((name: string) => {
      switch (name) {
        case 'port':
          return '3000';
        case 'type':
          return 'http';
        case 'region':
          return 'us';
        case 'token':
          return '';
        case 'subdomain':
          return '';
        case 'github-token':
          return 'fake-token';
        default:
          return '';
      }
    });
    mockGetBooleanInput.mockReturnValue(false);

    // Mock installer
    const { installLocalXpose } = require('../src/installer');
    installLocalXpose.mockResolvedValue('/path/to/loclx');

    // Mock tunnel creation
    const { createTunnel } = require('../src/tunnel');
    createTunnel.mockResolvedValue({
      url: 'https://test123.loclx.io',
      hostname: 'test123.loclx.io',
      pid: 12345,
      logPath: '/tmp/tunnel.log',
    });

    // Run the action
    await run();

    // Verify outputs
    expect(core.setOutput).toHaveBeenCalledWith(
      'url',
      'https://test123.loclx.io',
    );
    expect(core.setOutput).toHaveBeenCalledWith('hostname', 'test123.loclx.io');
    expect(core.setOutput).toHaveBeenCalledWith('status', 'running');

    // Verify state saved for post-action
    expect(core.saveState).toHaveBeenCalledWith('tunnelPid', '12345');
    expect(core.saveState).toHaveBeenCalledWith(
      'tunnelLogPath',
      '/tmp/tunnel.log',
    );

    // Verify tunnel info logged
    expect(core.info).toHaveBeenCalledWith('Tunnel process PID: 12345');
    expect(core.info).toHaveBeenCalledWith(
      'Tunnel will remain active for subsequent steps',
    );
  });

  it('should handle invalid port', async () => {
    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'port') return 'invalid';
      return '';
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Invalid port: invalid. Must be between 1 and 65535.',
    );
    expect(core.setOutput).toHaveBeenCalledWith('status', 'failed');
  });

  it('should use environment token when input not provided', async () => {
    process.env.LX_ACCESS_TOKEN = 'env-token';

    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'port') return '8080';
      if (name === 'token') return ''; // No input token
      return '';
    });

    const { installLocalXpose } = require('../src/installer');
    installLocalXpose.mockResolvedValue('/path/to/loclx');

    const { createTunnel } = require('../src/tunnel');
    createTunnel.mockResolvedValue({
      url: 'https://test.loclx.io',
      hostname: 'test.loclx.io',
      pid: 12345,
      logPath: '/tmp/tunnel.log',
    });

    await run();

    expect(createTunnel).toHaveBeenCalledWith(
      '/path/to/loclx',
      expect.objectContaining({
        token: 'env-token',
      }),
    );
  });

  it('should post PR comment when requested', async () => {
    // Mock PR context
    Object.defineProperty(github.context, 'eventName', {
      value: 'pull_request',
      configurable: true,
    });

    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
      typeof core.getBooleanInput
    >;

    mockGetInput.mockImplementation((name: string) => {
      if (name === 'port') return '3000';
      if (name === 'github-token') return 'github-token';
      return '';
    });

    // Mock getSafeBooleanInput to return true for pr-comment
    const { getSafeBooleanInput } = require('../src/utils');
    getSafeBooleanInput.mockImplementation((name: string) => {
      return name === 'pr-comment';
    });

    const { installLocalXpose } = require('../src/installer');
    installLocalXpose.mockResolvedValue('/path/to/loclx');

    const { createTunnel } = require('../src/tunnel');
    createTunnel.mockResolvedValue({
      url: 'https://test.loclx.io',
      hostname: 'test.loclx.io',
      pid: 12345,
      logPath: '/tmp/tunnel.log',
    });

    const { updatePRComment } = require('../src/pr-comment');
    updatePRComment.mockResolvedValue(undefined);

    await run();

    expect(updatePRComment).toHaveBeenCalledWith(
      'https://test.loclx.io',
      'github-token',
      '',
    );
  });

  it('should handle PR comment failure gracefully', async () => {
    Object.defineProperty(github.context, 'eventName', {
      value: 'pull_request',
      configurable: true,
    });

    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
      typeof core.getBooleanInput
    >;

    mockGetInput.mockImplementation((name: string) => {
      if (name === 'port') return '3000';
      return '';
    });

    // Mock getSafeBooleanInput to return true for pr-comment
    const { getSafeBooleanInput } = require('../src/utils');
    getSafeBooleanInput.mockReturnValue(true);

    const { installLocalXpose } = require('../src/installer');
    installLocalXpose.mockResolvedValue('/path/to/loclx');

    const { createTunnel } = require('../src/tunnel');
    createTunnel.mockResolvedValue({
      url: 'https://test.loclx.io',
      hostname: 'test.loclx.io',
      pid: 12345,
      logPath: '/tmp/tunnel.log',
    });

    const { updatePRComment } = require('../src/pr-comment');
    updatePRComment.mockRejectedValue(new Error('API error'));

    await run();

    // Should warn but not fail
    expect(core.warning).toHaveBeenCalledWith(
      'Failed to post PR comment: API error',
    );
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('status', 'running');
  });
});
