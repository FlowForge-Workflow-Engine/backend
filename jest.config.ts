import type { Config } from "jest";

/**
 * Root Jest configuration.
 * Supersedes the `jest` block in package.json so we can add the missing
 * `@app/database` module-name mapper alongside `@app/shared`.
 */
const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  transformIgnorePatterns: ["node_modules/(?!(uuid)/)"],
  // collectCoverageFrom: ["**/*.(t|j)s"],
  collectCoverageFrom: [
    "src/modules/**/*.(t|j)s", // ✅ only include src/modules
    "!**/*.d.ts", // optional: ignore types
    // "!**/libs/**", // optional: ignore shared libs
    "!src/modules/database/**/**.ts", // optional: ignore database module
    "!src/modules/health/**/**.ts", // optional: ignore health module
    "!src/**/*.module.ts",
    "!src/**/index.ts",
    "!src/**/*.dto.ts",
    "!src/**/*.interface.ts",
    "!src/**/*.types.ts",
    "!src/**/*.guard.ts",
    "!src/**/*.filter.ts",
    "!src/**/*.interceptor.ts",
    "!src/**/*.strategy.ts",
  ],
  coverageDirectory: "./coverage",
  coverageReporters: ["json", "json-summary", "lcov", "text", "clover"], // Customize as needed
  testEnvironment: "node",
  roots: ["<rootDir>/src/", "<rootDir>/libs/"],
  moduleNameMapper: {
    "^@app/shared(|/.*)$": "<rootDir>/libs/shared/src/$1",
    "^@app/database(|/.*)$": "<rootDir>/libs/database/src/$1",
  },
};

export default config;
