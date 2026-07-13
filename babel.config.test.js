// Minimal Babel config used ONLY for running unit tests on pure-JS modules
// (src/astro, src/services) via `npm test`. This intentionally avoids
// babel-preset-expo so `npm test` works with a small install and no Expo/RN
// toolchain — useful for quickly checking the astrology math and pricing
// logic before setting up the full mobile dev environment.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
