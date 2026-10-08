import type { Config } from 'jest';

const config: Config = {
  rootDir: '../..',
  roots: ['<rootDir>/tests/mobile'],
  testMatch: ['**/tests/mobile/**/*.spec.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tests/mobile/tsconfig.json',
      diagnostics: false,
    }],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/mobile/jest.setup.ts'],
  moduleNameMapper: {
    // SVG assets → null component
    '\\.svg$': '<rootDir>/tests/mobile/__mocks__/svg.ts',
    // PNG/JPG assets
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/tests/mobile/__mocks__/asset.ts',
    // Shared workspace package
    '^@agap/shared$': '<rootDir>/shared/src/index.ts',
    '^@agap/shared/(.*)$': '<rootDir>/shared/src/$1',
  },
  modulePaths: [
    '<rootDir>/tests/node_modules',
    '<rootDir>/mobile/node_modules',
  ],
};

export default config;
