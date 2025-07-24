import * as core from '@actions/core';
import * as github from '@actions/github';
import { updatePRComment } from './pr-comment';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('pr-comment', () => {
  const mockOctokit = {
    rest: {
      issues: {
        listComments: jest.fn(),
        createComment: jest.fn(),
        updateComment: jest.fn(),
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock github.getOctokit
    const mockGetOctokit = github.getOctokit as jest.MockedFunction<
      typeof github.getOctokit
    >;
    mockGetOctokit.mockReturnValue(mockOctokit as any);

    // Mock github context
    Object.defineProperty(github.context, 'payload', {
      value: {
        pull_request: {
          number: 123,
        },
      },
      configurable: true,
    });

    Object.defineProperty(github.context, 'repo', {
      value: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      configurable: true,
    });

    Object.defineProperty(github.context, 'runNumber', {
      value: 456,
      configurable: true,
    });

    Object.defineProperty(github.context, 'job', {
      value: 'test-job',
      configurable: true,
    });

    // Mock core.getInput
    const mockGetInput = core.getInput as jest.MockedFunction<
      typeof core.getInput
    >;
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'port') return '3000';
      return '';
    });
  });

  describe('updatePRComment', () => {
    it('should create a new comment when none exists', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      });

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 1 },
      });

      await updatePRComment(
        'https://test.loclx.io',
        'github-token',
        'Frontend',
      );

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
      });

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('<!-- localxpose-tunnels -->'),
      });

      const call = mockOctokit.rest.issues.createComment.mock.calls[0][0];
      expect(call.body).toContain('Frontend');
      expect(call.body).toContain('https://test.loclx.io');
      expect(call.body).toContain('3000');
    });

    it('should update existing comment with new tunnel', async () => {
      const existingBody = `<!-- localxpose-tunnels -->
## 🚀 LocalXpose Preview Deployments

<!-- tunnels-data:${Buffer.from(
        JSON.stringify([
          {
            name: 'Backend',
            url: 'https://backend.loclx.io',
            port: '8080',
            workflowRun: 455,
            jobName: 'backend-job',
            timestamp: new Date().toISOString(),
          },
        ]),
      ).toString('base64')}-->`;

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 456,
            body: existingBody,
          },
        ],
      });

      mockOctokit.rest.issues.updateComment.mockResolvedValue({
        data: { id: 456 },
      });

      await updatePRComment(
        'https://frontend.loclx.io',
        'github-token',
        'Frontend',
      );

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 456,
        body: expect.stringContaining('<!-- localxpose-tunnels -->'),
      });

      const call = mockOctokit.rest.issues.updateComment.mock.calls[0][0];
      expect(call.body).toContain('Frontend');
      expect(call.body).toContain('Backend');
      expect(call.body).toContain('https://frontend.loclx.io');
      expect(call.body).toContain('https://backend.loclx.io');
    });

    it('should remove expired tunnels', async () => {
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 minutes ago
      const existingBody = `<!-- localxpose-tunnels -->
## 🚀 LocalXpose Preview Deployments

<!-- tunnels-data:${Buffer.from(
        JSON.stringify([
          {
            name: 'Old Tunnel',
            url: 'https://old.loclx.io',
            port: '9999',
            workflowRun: 400,
            jobName: 'old-job',
            timestamp: oldTimestamp,
          },
        ]),
      ).toString('base64')}-->`;

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 456,
            body: existingBody,
          },
        ],
      });

      let capturedBody = '';
      mockOctokit.rest.issues.updateComment.mockImplementation(({ body }) => {
        capturedBody = body;
        return Promise.resolve({ data: { id: 456 } });
      });

      await updatePRComment(
        'https://new.loclx.io',
        'github-token',
        'New Tunnel',
      );

      expect(capturedBody).not.toContain('Old Tunnel');
      expect(capturedBody).toContain('New Tunnel');
    });

    it('should group tunnels by workflow run', async () => {
      const tunnels = [
        {
          name: 'Frontend',
          url: 'https://frontend.loclx.io',
          port: '3000',
          workflowRun: 456, // current run
          jobName: 'frontend-job',
          timestamp: new Date().toISOString(),
        },
        {
          name: 'Backend',
          url: 'https://backend.loclx.io',
          port: '8080',
          workflowRun: 455, // previous run
          jobName: 'backend-job',
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ];

      const existingBody = `<!-- localxpose-tunnels -->
<!-- tunnels-data:${Buffer.from(JSON.stringify([tunnels[1]])).toString('base64')}-->`;

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [{ id: 456, body: existingBody }],
      });

      let capturedBody = '';
      mockOctokit.rest.issues.updateComment.mockImplementation(({ body }) => {
        capturedBody = body;
        return Promise.resolve({ data: { id: 456 } });
      });

      await updatePRComment(
        'https://frontend.loclx.io',
        'github-token',
        'Frontend',
      );

      expect(capturedBody).toContain('Current Workflow Run');
      expect(capturedBody).toContain('Previous Runs');
      expect(capturedBody).toContain('Run #455');
    });

    it('should show expiry warnings', async () => {
      const almostExpired = new Date(Date.now() - 13 * 60 * 1000).toISOString(); // 13 minutes ago
      const expired = new Date(Date.now() - 16 * 60 * 1000).toISOString(); // 16 minutes ago

      const tunnels = [
        {
          name: 'Almost Expired',
          url: 'https://almost.loclx.io',
          port: '3000',
          workflowRun: 456,
          jobName: 'test-job',
          timestamp: almostExpired,
        },
        {
          name: 'Expired',
          url: 'https://expired.loclx.io',
          port: '8080',
          workflowRun: 456,
          jobName: 'test-job',
          timestamp: expired,
        },
      ];

      const existingBody = `<!-- localxpose-tunnels -->
<!-- tunnels-data:${Buffer.from(JSON.stringify(tunnels)).toString('base64')}-->`;

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [{ id: 456, body: existingBody }],
      });

      let capturedBody = '';
      mockOctokit.rest.issues.updateComment.mockImplementation(({ body }) => {
        capturedBody = body;
        return Promise.resolve({ data: { id: 456 } });
      });

      await updatePRComment('https://new.loclx.io', 'github-token', 'New');

      expect(capturedBody).toContain('Expires soon');
      expect(capturedBody).toContain('~~https://expired.loclx.io~~');
      expect(capturedBody).toContain('⏰ Expired');
    });

    it('should throw error when no PR context', async () => {
      Object.defineProperty(github.context, 'payload', {
        value: {},
        configurable: true,
      });

      await expect(
        updatePRComment('https://test.loclx.io', 'token'),
      ).rejects.toThrow('No pull request found in context');
    });

    it('should use default tunnel name based on port', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      });

      let capturedBody = '';
      mockOctokit.rest.issues.createComment.mockImplementation(({ body }) => {
        capturedBody = body;
        return Promise.resolve({ data: { id: 1 } });
      });

      await updatePRComment('https://test.loclx.io', 'github-token');

      expect(capturedBody).toContain('Port 3000');
    });
  });
});
