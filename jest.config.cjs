module.exports = {
  testMatch: ["<rootDir>/tests/**/*.spec.ts", "<rootDir>/tests/**/*.spec.cjs"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.tests.json" }],
  },
  testEnvironment: "node",
  testTimeout: 30000,
  moduleNameMapper: {
    // Prisma 7 generates .js import specifiers in its TypeScript sources.
    // Jest executes source; Node executes the compiled .js files unchanged.
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@lamu/runtime$": "<rootDir>/shared/libraries/runtime/src",
  },
  collectCoverageFrom: [
    "gateway/src/**/*.ts",
    "services/identity-service/src/**/*.ts",
    "shared/libraries/runtime/src/**/*.ts",
    "!**/main.ts",
    "!**/generated/**",
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
  coverageDirectory: "coverage",
};
