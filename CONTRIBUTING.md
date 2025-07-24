# Contributing to the LocalXpose GitHub Action

Thank you for your interest in contributing to the LocalXpose GitHub Action! This guide will help you get started with development.

## Prerequisites

- **Node.js 20+** (we use Node 20 in CI)
- **npm 9+** (comes with Node.js)
- A GitHub account for testing GitHub Actions features
- A free or paid [LocalXpose account](https://localxpose.io/signup?utm_source=github&utm_medium=action&utm_content=contrib)

## Getting Started

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/localxpose-action.git
   cd localxpose-action
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run the test suite**
   ```bash
   npm test
   ```

## Development Workflow

### Before Making Changes

1. Create a new branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Ensure all tests pass:
   ```bash
   npm test
   ```

### Making Changes

1. Write your code following the existing patterns
2. Add tests for new functionality
3. Update documentation if needed

### Before Committing

**IMPORTANT**: Always run the full check suite before committing:

```bash
npm run all
```

This command will:

- Format your code with Prettier
- Lint with ESLint
- Build the action
- Run all tests

Individual commands available:

- `npm run format` - Auto-format code
- `npm run lint` - Check for linting issues
- `npm run build` - Compile TypeScript and bundle
- `npm test` - Run Jest tests

### Commit Guidelines

- Use clear, descriptive commit messages
- Follow conventional commits format when possible:
  - `feat:` New features
  - `fix:` Bug fixes
  - `docs:` Documentation changes
  - `test:` Test additions/changes
  - `refactor:` Code refactoring

## Testing

### Unit Tests

We use Jest for unit testing. Tests are co-located with source files:

- `src/module.ts` → `src/module.test.ts`

Run tests:

```bash
npm test                  # Run all tests
npm test -- --watch      # Watch mode
npm test -- --coverage   # With coverage report
```

### Integration Testing

Since we're a GitHub Action, full integration testing requires:

1. Pushing changes to a branch
2. Creating a test workflow that uses your action
3. Observing the results in GitHub Actions

Example test workflow:

```yaml
name: Test LocalXpose Action
on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./ # Uses ./dist/ in the current repository. Run `npm run all` before pushing!
        with:
          port: 3000
          token: ${{ secrets.LX_ACCESS_TOKEN }}
```

## Code Style

- **TypeScript**: We use strict TypeScript settings
- **Formatting**: Prettier with single quotes and semicolons
- **Linting**: ESLint with TypeScript rules
- **File naming**: Use kebab-case for files (`my-module.ts`)

## Project Structure

```
localxpose-action/
├── src/                 # TypeScript source files
│   ├── index.ts         # Entry point (main and post)
│   ├── main.ts          # Main action logic
│   ├── installer.ts     # LocalXpose CLI installation
│   ├── tunnel.ts        # Tunnel management
│   └── *.test.ts        # Test files
├── dist/                # Compiled and bundled output
├── action.yml           # Action metadata
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Common Development Tasks

### Adding a New Input Parameter

1. Update `action.yml` with the new input
2. Add validation in `src/main.ts`
3. Update README.md with usage examples
4. Add tests for the new parameter

### Debugging

- Use `core.debug()` for debug output (visible with `ACTIONS_STEP_DEBUG=true`)
- Check `dist/index.js` is updated after building
- Test locally by creating a test repository

### Updating Dependencies

```bash
npm update                      # Update all dependencies
npm audit fix                   # Fix security vulnerabilities
npm run all                     # Verify everything still works
```

## Pull Request Process

1. **Update your branch** with the latest main:

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Ensure all checks pass**:

   ```bash
   npm run all
   ```

3. **Push your branch** and create a PR

4. **PR Requirements**:
   - Clear description of changes
   - Tests for new functionality
   - All CI checks passing
   - No merge conflicts

## Troubleshooting

### Common Issues

**Build fails with "check-dist" error**

- Run `npm run build` and commit the changes to `dist/`

**Tests fail on Windows**

- Ensure you're handling path separators correctly
- Use Node.js `path` module for cross-platform paths

**ESLint/Prettier conflicts**

- Run `npm run format` to auto-fix formatting
- Check `.eslintrc.json` and `.prettierrc.json` for rules

### Getting Help

- Check existing issues and PRs
- Ask questions in PR comments
- Review the test files for usage examples

## Security

- Never commit secrets or tokens
- Use `core.setSecret()` for masking sensitive values
- Report security issues privately to security@localxpose.io

## Release Process

Releases are managed by maintainers:

1. Update version in `package.json`
2. Run `npm run all`
3. Create GitHub release with changelog
4. Update major version tags (e.g., `v1` → latest `v1.x.x`)

## Questions?

Feel free to open an issue for:

- Bug reports
- Feature requests
- Documentation improvements
- General questions

Thank you for contributing!

LocalXpose Team - hello@localxpose.io

<div>
  <p>
    <a href="https://localxpose.io/?utm_source=github&utm_medium=action&utm_content=contrib">
      <kbd><img src="media/localxpose-tunnel-expose-action.png" alt="LocalXpose" width="200"></kbd>
    </a>
  </p>
  <p>
    <a href="https://localxpose.io/download?utm_source=github&utm_medium=action&utm_content=contrib">Download LocalXpose</a> •
    <a href="https://localxpose.io/docs?utm_source=github&utm_medium=action&utm_content=contrib">Documentation</a> •
    <a href="https://localxpose.io/pricing?utm_source=github&utm_medium=action&utm_content=contrib">Pricing</a>
  </p>
</div>
