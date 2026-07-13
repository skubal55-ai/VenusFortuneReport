module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/functions/node_modules/"],
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {
    "^.+\\.js$": ["babel-jest", { configFile: "./babel.config.test.js" }],
  },
};
