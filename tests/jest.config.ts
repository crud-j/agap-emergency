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
