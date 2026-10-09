import type { Config } from 'jest';

/**
 * Frontend unit/smoke tests. Pure logic (no DOM) runs in the Node environment
 * via ts-jest with isolatedModules (transpile-only — types are enforced by
 * `pnpm typecheck`). `@/` resolves to the package root to mirror tsconfig paths.
 */
const config: Config = {
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          isolatedModules: true,
          module: 'CommonJS',
          moduleResolution: 'Node',
          esModuleInterop: true,
          skipLibCheck: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
