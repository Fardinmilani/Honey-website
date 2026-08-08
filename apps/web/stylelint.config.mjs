/** @type {import('stylelint').Config} */
const config = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/public/media/**'],
  rules: {
    'declaration-property-value-disallowed-list': [
      {
        '/^(margin|padding|border|inset|scroll-margin|scroll-padding)$/': [
          '/\\bleft\\b/',
          '/\\bright\\b/',
        ],
        '/^(margin|padding|border)-(left|right)$/': [/.*/],
        '/^(left|right)$/': [/.*/],
        float: ['left', 'right'],
        'text-align': ['left', 'right'],
        clear: ['left', 'right'],
      },
      {
        message:
          'Use CSS logical properties (inline/block, start/end) instead of physical left/right.',
      },
    ],
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'color-hex-length': null,
    'alpha-value-notation': null,
    'color-function-notation': null,
    'import-notation': null,
    'media-feature-range-notation': null,
    'value-keyword-case': null,
    'property-no-vendor-prefix': null,
    'property-no-deprecated': null,
    'selector-not-notation': null,
    'declaration-block-no-redundant-longhand-properties': null,
  },
};

export default config;
