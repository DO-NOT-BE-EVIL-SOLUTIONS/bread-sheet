// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const nodeGlobals = {
  __dirname: 'readonly',
  console: 'readonly',
  module: 'writable',
  process: 'readonly',
  require: 'readonly',
};

const jestGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  jest: 'readonly',
  test: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // scripts/ is plain CommonJS Node tooling (the Maestro runner, TICKET-P9-003), not app
    // code — the Expo preset assumes React Native/browser globals, so without this every
    // `require` and `__dirname` in an 800-line runner reads as an undefined variable and the
    // whole directory goes unlinted. `npm run lint` covers it via the second eslint pass.
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...jestGlobals },
    },
  },
]);
