module.exports = {
  setupFiles: ["<rootDir>/jest.env.js"],
  clearMocks: true,
  moduleFileExtensions: ["js", "ts"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.[jt]s$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ["/node_modules/(?!@actions/(artifact|github)/)"],
  moduleNameMapper: {
    "^@actions/artifact$":
      "<rootDir>/node_modules/@actions/artifact/lib/artifact.js",
    "^@actions/github$": "<rootDir>/node_modules/@actions/github/lib/github.js",
    "^@actions/github/lib/utils$":
      "<rootDir>/node_modules/@actions/github/lib/utils.js",
  },
  verbose: true,
};
