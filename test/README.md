# FireScope Testing

This directory contains the test suite for FireScope, including unit tests for core functionality and a custom test runner.

## Quick Start

### Option 1: Using npm (Recommended)

```bash
npm test
```

This will start a local server and automatically open the test runner in your browser.

### Option 2: Using the test runner script

```bash
node test/run-tests.js
```

Alternative method that does the same as `npm test`.

### Option 3: Manual browser testing

1. Start a local server in the project root:
   ```bash
   python3 -m http.server 8080
   ```
2. Open http://localhost:8080/test/test-runner.html in your browser

### Option 4: Direct file opening

Simply open `test/test-runner.html` directly in your browser (may have CORS limitations).

## Test Structure

### Files

- **`test-runner.html`** - Web-based test runner with custom testing framework
- **`tests.js`** - Main test suite with all unit tests
- **`run-tests.js`** - CLI script to start server and open tests
- **`README.md`** - This file

### Test Categories

#### 1. Configuration Tests

- CONFIG object validation
- Operator mappings
- URL validation

#### 2. Core Component Tests

- **StateManager**: Collection management, request tracking
- **SearchManager**: Collection filtering, search logic
- **NotificationManager**: Enable/disable functionality, message display
- **RequestProcessor**: Query parsing, URL extraction, operator handling
- **SettingsManager**: Settings loading/saving, validation

#### 3. Edge Cases & Error Handling

- Invalid input handling
- Empty/null data scenarios
- Error recovery

## Test Framework

FireScope uses a custom, lightweight testing framework built into `test-runner.html`. Features include:

- **Describe blocks** for organizing tests
- **Assertion methods**: `toBe()`, `toEqual()`, `toBeTruthy()`, `toBeFalsy()`, `toContain()`
- **Async support** for testing ES6 modules
- **Visual results** with pass/fail indicators
- **Error reporting** with stack traces
- **Summary statistics**

### Writing Tests

```javascript
describe('My Component', async () => {
  const { MyComponent } = await import('../js/my-component.js');
  const component = new MyComponent();

  expect(component.someMethod()).toBe('expected result');
  expect(component.someProperty).toBeTruthy();
});
```

### Mocking DOM Elements

Since components often interact with the DOM, tests use mocking:

```javascript
const originalGetElementById = document.getElementById;
document.getElementById = id => {
  if (id === 'myElement')
    return { textContent: '', classList: { add: () => {} } };
  return null;
};

// ... run tests ...

document.getElementById = originalGetElementById;
```

## Available npm Scripts

- `npm test` - Run all tests
- `npm run test:server` - Start test server only
- `npm run test:open` - Open test runner (server must be running)
- `npm run lint` - Check JavaScript syntax
- `npm run validate` - Validate manifest.json
- `npm run build` - Run all checks (lint + validate)

## Adding New Tests

1. Open `tests.js`
2. Add a new `describe` block
3. Import the module to test
4. Write assertions using `expect()`
5. Mock any DOM dependencies
6. Refresh the test runner to see results

### Example Test Addition

```javascript
describe('New Component Tests', async () => {
  const { NewComponent } = await import('../js/new-component.js');
  const component = new NewComponent();

  expect(component.isWorking()).toBe(true);
  expect(component.getValue()).toEqual({ status: 'ok' });
});
```

## Troubleshooting

### Tests Not Loading

- Ensure you're running a local server (CORS restrictions)
- Check browser console for import errors
- Verify all file paths are correct

### DOM-Related Errors

- Make sure DOM elements are properly mocked
- Check that `document.getElementById` is restored after tests
- Verify mock objects have all required methods/properties

### Module Import Issues

- Ensure ES6 modules are properly exported
- Check for circular dependencies
- Verify file paths are relative to test-runner.html

### Server Issues

- Try a different port if 8080 is in use
- Ensure Python 3 is installed for the HTTP server
- Check firewall settings

## Continuous Integration

To run tests in CI environments:

```bash
# Install dependencies (if any)
npm install

# Run linting and validation
npm run build

# For headless testing, consider using a tool like Puppeteer:
# npm install puppeteer
# node scripts/headless-test.js
```

## Best Practices

1. **Mock external dependencies** (DOM, APIs, etc.)
2. **Test one thing per test** - keep tests focused
3. **Use descriptive test names** - explain what's being tested
4. **Clean up after tests** - restore mocked functions
5. **Test edge cases** - null/undefined inputs, error conditions
6. **Keep tests fast** - avoid unnecessary delays or complex setup

## Contributing

When adding new functionality:

1. Write tests for new components/methods
2. Ensure existing tests still pass
3. Add edge case testing
4. Update this README if adding new test categories
