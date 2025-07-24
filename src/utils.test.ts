import * as core from '@actions/core';
import { getSafeBooleanInput } from './utils';

jest.mock('@actions/core');

describe('utils', () => {
  describe('getSafeBooleanInput', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return value from getBooleanInput when it succeeds', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      mockGetBooleanInput.mockReturnValue(true);

      const result = getSafeBooleanInput('test-input');

      expect(result).toBe(true);
      expect(mockGetBooleanInput).toHaveBeenCalledWith('test-input', undefined);
    });

    it('should pass options to getBooleanInput', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      mockGetBooleanInput.mockReturnValue(false);

      const result = getSafeBooleanInput('test-input', { required: true });

      expect(result).toBe(false);
      expect(mockGetBooleanInput).toHaveBeenCalledWith('test-input', {
        required: true,
      });
    });

    it('should fallback to getInput when getBooleanInput throws', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      const mockGetInput = core.getInput as jest.MockedFunction<
        typeof core.getInput
      >;

      mockGetBooleanInput.mockImplementation(() => {
        throw new Error('Input does not meet YAML specification');
      });
      mockGetInput.mockReturnValue('true');

      const result = getSafeBooleanInput('pr-comment');

      expect(result).toBe(true);
      expect(mockGetInput).toHaveBeenCalledWith('pr-comment', undefined);
    });

    it('should handle various true values in fallback', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      const mockGetInput = core.getInput as jest.MockedFunction<
        typeof core.getInput
      >;

      mockGetBooleanInput.mockImplementation(() => {
        throw new Error('Input does not meet YAML specification');
      });

      // Test 'true'
      mockGetInput.mockReturnValue('true');
      expect(getSafeBooleanInput('test')).toBe(true);

      // Test 'True'
      mockGetInput.mockReturnValue('True');
      expect(getSafeBooleanInput('test')).toBe(true);

      // Test '1'
      mockGetInput.mockReturnValue('1');
      expect(getSafeBooleanInput('test')).toBe(true);

      // Test 'yes'
      mockGetInput.mockReturnValue('yes');
      expect(getSafeBooleanInput('test')).toBe(true);

      // Test 'YES'
      mockGetInput.mockReturnValue('YES');
      expect(getSafeBooleanInput('test')).toBe(true);
    });

    it('should handle false values in fallback', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      const mockGetInput = core.getInput as jest.MockedFunction<
        typeof core.getInput
      >;

      mockGetBooleanInput.mockImplementation(() => {
        throw new Error('Input does not meet YAML specification');
      });

      // Test 'false'
      mockGetInput.mockReturnValue('false');
      expect(getSafeBooleanInput('test')).toBe(false);

      // Test '0'
      mockGetInput.mockReturnValue('0');
      expect(getSafeBooleanInput('test')).toBe(false);

      // Test 'no'
      mockGetInput.mockReturnValue('no');
      expect(getSafeBooleanInput('test')).toBe(false);

      // Test empty string
      mockGetInput.mockReturnValue('');
      expect(getSafeBooleanInput('test')).toBe(false);
    });

    it('should handle empty string as false when not required', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      const mockGetInput = core.getInput as jest.MockedFunction<
        typeof core.getInput
      >;

      mockGetBooleanInput.mockImplementation(() => {
        throw new Error('Input does not meet YAML specification');
      });
      mockGetInput.mockReturnValue('');

      const result = getSafeBooleanInput('test', { required: false });

      expect(result).toBe(false);
    });

    it('should trim whitespace from input values', () => {
      const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
        typeof core.getBooleanInput
      >;
      const mockGetInput = core.getInput as jest.MockedFunction<
        typeof core.getInput
      >;

      mockGetBooleanInput.mockImplementation(() => {
        throw new Error('Input does not meet YAML specification');
      });
      mockGetInput.mockReturnValue('  true  ');

      const result = getSafeBooleanInput('test');

      expect(result).toBe(true);
    });
  });
});
