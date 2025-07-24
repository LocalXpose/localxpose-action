// Mock the modules first
const mockRun = jest.fn();
const mockCleanup = jest.fn();
const mockGetState = jest.fn();
const mockSaveState = jest.fn();

jest.mock('@actions/core', () => ({
  getState: mockGetState,
  saveState: mockSaveState,
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

jest.mock('./main', () => ({
  run: mockRun,
}));

jest.mock('./cleanup', () => ({
  cleanup: mockCleanup,
}));

describe('index', () => {
  let originalExit: typeof process.exit;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock process.exit
    originalExit = process.exit;
    process.exit = jest.fn() as any;

    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should run main action when not in post mode', async () => {
    // Set up mocks
    mockGetState.mockReturnValue(''); // Not in post mode
    mockRun.mockResolvedValue(undefined);

    // Import and execute index (this runs the code immediately)
    require('./index');

    // Wait for async execution
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockRun).toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockSaveState).toHaveBeenCalledWith('isPost', 'true');
    expect(console.log).toHaveBeenCalledWith('Action completed successfully');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should run cleanup when in post mode', async () => {
    // Set up mocks
    mockGetState.mockReturnValue('true'); // In post mode
    mockCleanup.mockResolvedValue(undefined);

    // Import and execute index
    require('./index');

    // Wait for async execution
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCleanup).toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSaveState).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('Action completed successfully');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle errors and exit with code 1', async () => {
    // Set up mocks
    const testError = new Error('Test error');
    mockGetState.mockReturnValue(''); // Not in post mode
    mockRun.mockRejectedValue(testError);

    // Import and execute index
    require('./index');

    // Wait for async execution
    await new Promise((resolve) => setImmediate(resolve));

    expect(console.error).toHaveBeenCalledWith('Action failed:', testError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
