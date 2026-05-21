import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'dist/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default config;
