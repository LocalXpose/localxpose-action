import {
  sanitizeLogOutput,
  validateInput,
  ValidationPatterns,
  maskSecrets,
} from './security';
import * as core from '@actions/core';

jest.mock('@actions/core');

describe('security', () => {
  describe('sanitizeLogOutput', () => {
    it('should mask tokens in log output', () => {
      const input = 'Starting with token: abc123xyz789';
      const result = sanitizeLogOutput(input, ['abc123xyz789']);
      expect(result).toBe('Starting with token: ab********89');
    });

    it('should mask short tokens completely', () => {
      const input = 'Token: abc';
      const result = sanitizeLogOutput(input, ['abc']);
      expect(result).toBe('Token: ***');
    });

    it('should mask multiple occurrences', () => {
      const input = 'Token abc123 used in abc123 request';
      const result = sanitizeLogOutput(input, ['abc123']);
      expect(result).toBe('Token ab**23 used in ab**23 request');
    });

    it('should mask environment variable patterns', () => {
      const input = 'LX_ACCESS_TOKEN=super-secret-token';
      const result = sanitizeLogOutput(input, []);
      expect(result).toBe('LX_ACCESS_TOKEN=***');
    });

    it('should mask token patterns', () => {
      const tests = [
        ['token: "secret123"', 'token=***'],
        ['token="secret123"', 'token=***'],
        ["token: 'secret123'", 'token=***'],
        ['token:secret123', 'token=***'],
        ['Token = secret123', 'Token=***'], // Preserves case
      ];

      for (const [input, expected] of tests) {
        const result = sanitizeLogOutput(input, []);
        expect(result).toContain(expected);
      }
    });

    it('should mask Bearer tokens', () => {
      const input =
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = sanitizeLogOutput(input, []);
      expect(result).toBe('Authorization: Bearer ***');
    });

    it('should handle empty secrets array', () => {
      const input = 'Normal log output';
      const result = sanitizeLogOutput(input, []);
      expect(result).toBe('Normal log output');
    });

    it('should handle special regex characters in secrets', () => {
      const input = 'Secret: $pecial.char*';
      const result = sanitizeLogOutput(input, ['$pecial.char*']);
      expect(result).toBe('Secret: $p*********r*');
    });
  });

  describe('validateInput', () => {
    it('should validate subdomain format', () => {
      // Valid subdomains
      expect(() =>
        validateInput('myapp', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).not.toThrow();
      expect(() =>
        validateInput('my-app', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).not.toThrow();
      expect(() =>
        validateInput('app123', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).not.toThrow();
      expect(() =>
        validateInput('a', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).not.toThrow();

      // Invalid subdomains
      expect(() =>
        validateInput('-app', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
      expect(() =>
        validateInput('app-', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
      expect(() =>
        validateInput('my_app', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
      expect(() =>
        validateInput('My-App', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
      expect(() =>
        validateInput('app.com', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
      expect(() =>
        validateInput('', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow();
    });

    it('should validate region format', () => {
      // Valid regions
      expect(() =>
        validateInput('us', ValidationPatterns.REGION, 'region'),
      ).not.toThrow();
      expect(() =>
        validateInput('eu', ValidationPatterns.REGION, 'region'),
      ).not.toThrow();
      expect(() =>
        validateInput('ap', ValidationPatterns.REGION, 'region'),
      ).not.toThrow();
      expect(() =>
        validateInput('us-west', ValidationPatterns.REGION, 'region'),
      ).not.toThrow();
      expect(() =>
        validateInput('eu-central', ValidationPatterns.REGION, 'region'),
      ).not.toThrow();

      // Invalid regions
      expect(() =>
        validateInput('US', ValidationPatterns.REGION, 'region'),
      ).toThrow();
      expect(() =>
        validateInput('u', ValidationPatterns.REGION, 'region'),
      ).toThrow();
      expect(() =>
        validateInput('us1', ValidationPatterns.REGION, 'region'),
      ).toThrow();
      expect(() =>
        validateInput('us-', ValidationPatterns.REGION, 'region'),
      ).toThrow();
      expect(() =>
        validateInput('-us', ValidationPatterns.REGION, 'region'),
      ).toThrow();
    });

    it('should validate port format', () => {
      // Valid ports
      expect(() =>
        validateInput('80', ValidationPatterns.PORT, 'port'),
      ).not.toThrow();
      expect(() =>
        validateInput('8080', ValidationPatterns.PORT, 'port'),
      ).not.toThrow();
      expect(() =>
        validateInput('65535', ValidationPatterns.PORT, 'port'),
      ).not.toThrow();
      expect(() =>
        validateInput('1', ValidationPatterns.PORT, 'port'),
      ).not.toThrow();

      // Invalid ports
      expect(() =>
        validateInput('0', ValidationPatterns.PORT, 'port'),
      ).toThrow();
      expect(() =>
        validateInput('65536', ValidationPatterns.PORT, 'port'),
      ).toThrow();
      expect(() =>
        validateInput('080', ValidationPatterns.PORT, 'port'),
      ).toThrow();
      expect(() =>
        validateInput('abc', ValidationPatterns.PORT, 'port'),
      ).toThrow();
      expect(() =>
        validateInput('-1', ValidationPatterns.PORT, 'port'),
      ).toThrow();
    });

    it('should validate tunnel type', () => {
      // Valid types
      expect(() =>
        validateInput('http', ValidationPatterns.TYPE, 'type'),
      ).not.toThrow();
      expect(() =>
        validateInput('https', ValidationPatterns.TYPE, 'type'),
      ).not.toThrow();
      expect(() =>
        validateInput('tcp', ValidationPatterns.TYPE, 'type'),
      ).not.toThrow();
      expect(() =>
        validateInput('tls', ValidationPatterns.TYPE, 'type'),
      ).not.toThrow();

      // Invalid types
      expect(() =>
        validateInput('HTTP', ValidationPatterns.TYPE, 'type'),
      ).toThrow();
      expect(() =>
        validateInput('ftp', ValidationPatterns.TYPE, 'type'),
      ).toThrow();
      expect(() =>
        validateInput('', ValidationPatterns.TYPE, 'type'),
      ).toThrow();
    });

    it('should include pattern in error message', () => {
      expect(() =>
        validateInput('invalid!', ValidationPatterns.SUBDOMAIN, 'subdomain'),
      ).toThrow(/Must match pattern:.*\^/);
    });
  });

  describe('maskSecrets', () => {
    it('should call core.setSecret for each secret', () => {
      const mockSetSecret = core.setSecret as jest.MockedFunction<
        typeof core.setSecret
      >;

      maskSecrets(['secret1', 'secret2', 'secret3']);

      expect(mockSetSecret).toHaveBeenCalledTimes(3);
      expect(mockSetSecret).toHaveBeenCalledWith('secret1');
      expect(mockSetSecret).toHaveBeenCalledWith('secret2');
      expect(mockSetSecret).toHaveBeenCalledWith('secret3');
    });

    it('should skip empty strings', () => {
      const mockSetSecret = core.setSecret as jest.MockedFunction<
        typeof core.setSecret
      >;
      mockSetSecret.mockClear();

      maskSecrets(['valid', '', 'another']);

      expect(mockSetSecret).toHaveBeenCalledTimes(2);
      expect(mockSetSecret).toHaveBeenCalledWith('valid');
      expect(mockSetSecret).toHaveBeenCalledWith('another');
    });

    it('should handle empty array', () => {
      const mockSetSecret = core.setSecret as jest.MockedFunction<
        typeof core.setSecret
      >;
      mockSetSecret.mockClear();

      maskSecrets([]);

      expect(mockSetSecret).not.toHaveBeenCalled();
    });
  });
});
