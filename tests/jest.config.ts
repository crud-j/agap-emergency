import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: {
        ignoreCodes: ['TS151002'],
      },
    }],
  },
  testEnvironment: 'node',
  // bcrypt at 12 rounds (auth specs) is CPU-bound and can exceed the 5s default
  // when suites run in parallel on a loaded machine.
  testTimeout: 30_000,
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/../backend/src/$1',
    '^@agap/shared$': '<rootDir>/../shared/src/index.ts',
    '^@agap/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
  modulePaths: ['<rootDir>/../backend/node_modules'],
  collectCoverageFrom: ['../backend/src/**/*.ts'],
  coverageDirectory: './coverage',
};

export default config;
