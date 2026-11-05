// Source-level CSS rules. The compiled-bundle audit in @bond/build
// (css-audit.mjs) re-checks what actually ships. docs/css-architecture.md
import namespace from '@bond/build/stylelint-plugin';

const BEM = '(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?';

/** @type {import('stylelint').Config} */
export default {
  plugins: [namespace],
  reportDescriptionlessDisables: true,
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  rules: {
    'bond/selector-namespace': true,

    // Naming: prefix-block__element--modifier, plus is-/has- state classes and DNN's own classes as context.
    'selector-class-pattern': [
      `^(?:[a-z][a-z0-9]{1,11}-[a-z0-9]+(?:-[a-z0-9]+)*${BEM}|(?:is|has)-[a-z0-9-]+|(?:dnn|DNN|Dnn)[A-Za-z0-9_-]*)$`,
      { message: (s) => `Class "${s}" must follow <prefix>-block__element--modifier (docs/css-architecture.md#naming)` },
    ],
    'custom-property-pattern': [
      '^_?(?:bond|dnn|[a-z][a-z0-9]{1,11})-[a-z0-9]+(?:-[a-z0-9]+)*$',
      { message: (p) => `Custom property "--${p}" must be namespaced (--bond-*, --<prefix>-*)` },
    ],
    'custom-media-pattern': ['^bond-[a-z0-9-]+$', { message: 'Use the shared @custom-media from @bond/tokens/media.css' }],
    'keyframes-name-pattern': ['^[a-z][a-z0-9]{1,11}-[a-z0-9-]+$', { message: (k) => `@keyframes "${k}" must be prefixed (e.g. bond-fade-up)` }],

    // Specificity control - no ids, no !important, shallow selectors.
    'selector-max-id': 0,
    'declaration-no-important': true,
    'selector-max-specificity': ['0,3,1'],
    'selector-max-compound-selectors': 4,
    'selector-max-universal': [1, { ignoreAfterCombinators: [] }],
    // selector-no-qualifying-type is intentionally OFF: interactive components use
    // `.bond-button:is(a, button, input)` to reach exactly (0,1,1) so they win ties
    // against module CSS (docs/css-architecture.md#specificity-rules). Specificity
    // is still capped by selector-max-specificity and audited in the compiled bundle.

    // Cascade layers lose to DNN's unlayered default.css and module CSS.
    'at-rule-disallowed-list': [['layer', 'import-glob'], { message: '@layer is not used in DNN themes - see docs/css-architecture.md#why-no-cascade-layers' }],
    'function-disallowed-list': [['expression']],

    // Correctness.
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-syntaxes'] }],
    'declaration-block-no-duplicate-custom-properties': true,
    'no-duplicate-selectors': true,
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'font-family-no-missing-generic-family-keyword': [true, { ignoreFontFamilies: [] }],
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': true,
    'selector-pseudo-element-no-unknown': true,
    'unit-no-unknown': true,
    'no-invalid-position-at-import-rule': true,
    'function-url-no-scheme-relative': true,
    'function-url-scheme-allowed-list': ['data'],
  },
};
