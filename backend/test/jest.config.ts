import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testMatch: ['**/test/**/*.spec.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@agap/shared$': '<rootDir>/../shared/src/index.ts',
    '^@agap/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
};

export default config;
