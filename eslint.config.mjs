// ESLint flat config. Browser code (shipped to DNN pages) gets strict security
// rules; Node tooling gets Node globals. docs/security.md#frontend-code
import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

const browserSecurity = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-restricted-properties': ['error',
    { object: 'document', property: 'write', message: 'document.write blocks parsing and is an XSS sink.' },
    { object: 'document', property: 'writeln', message: 'document.writeln is an XSS sink.' },
  ],
  'no-restricted-syntax': ['error',
    { selector: "CallExpression[callee.name='setTimeout'][arguments.0.type='Literal']", message: 'String argument to setTimeout is eval.' },
    { selector: "CallExpression[callee.name='setInterval'][arguments.0.type='Literal']", message: 'String argument to setInterval is eval.' },
    { selector: "AssignmentExpression[left.property.name=/^on[a-z]+$/]", message: 'Use addEventListener instead of on* properties.' },
  ],
  'no-unsanitized/method': 'error',
  'no-unsanitized/property': 'error',
};

export default [
  { ignores: ['publish/**', 'node_modules/**', '**/node_modules/**', '**/test-results/**', '**/playwright-report/**', 'install/**'] },
  js.configs.recommended,
  {
    files: ['packages/*/src/**/*.js', 'themes/*/scripts/**/*.js', 'packages/build/templates/theme/scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, Sys: 'readonly' } },
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: { ...browserSecurity, 'no-console': ['warn', { allow: ['error', 'warn'] }] },
  },
  {
    files: ['**/*.mjs', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['tests/**/*.spec.mjs', 'tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
