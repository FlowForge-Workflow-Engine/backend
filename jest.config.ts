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
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "./coverage",
  testEnvironment: "node",
  roots: ["<rootDir>/src/", "<rootDir>/libs/"],
  moduleNameMapper: {
    "^@app/shared(|/.*)$": "<rootDir>/libs/shared/src/$1",
    "^@app/database(|/.*)$": "<rootDir>/libs/database/src/$1",
  },
};

export default config;
