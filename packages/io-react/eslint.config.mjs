import baseConfig from '../../eslint.config.mjs';
import jsoncEslintParser from 'jsonc-eslint-parser';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {},
  },
  {
    files: ['*.json'],
    languageOptions: {
      parser: jsoncEslintParser,
    },
    rules: {},
  },
];
