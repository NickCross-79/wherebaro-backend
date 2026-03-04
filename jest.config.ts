import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  moduleNameMapper: {
    "^@wfcd/mod-generator$": "<rootDir>/src/__mocks__/mod-generator.ts",
  },
};

export default config;
