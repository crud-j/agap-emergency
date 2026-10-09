import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testMatch: ['**/test/**/*.spec.ts'],
  // isolatedModules = per-file transpile (no cross-file type-checking). Types are
  // enforced by `pnpm typecheck`/`build`; here it cuts suite time from minutes to
  // seconds and silences ts-jest's hybrid-module (Node16/Next) warning.
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }] },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@agap/shared$': '<rootDir>/../shared/src/index.ts',
    '^@agap/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
};

export default config;
