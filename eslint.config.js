import js from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'playwright-report/**', 'test-results/**', 'docs/screenshots/**', 'node_modules/**'] },
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [['@babel/preset-typescript', { ignoreExtensions: true }]],
          plugins: ['@babel/plugin-syntax-jsx'],
        },
      },
    },
    rules: {
      'no-undef': 'off',
      // Babel 8 parses TypeScript 7 without coupling to compiler internals, but
      // its ESLint scope manager cannot reliably see type-only or JSX usage.
      // `tsc --noEmit` remains the authority for those references.
      'no-unused-vars': 'off',
    },
  },
]
