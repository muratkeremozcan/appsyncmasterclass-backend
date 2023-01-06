module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  env: {
    es6: true,
    amd: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    parser: '@babel/eslint-parser',
    sourceType: 'module',
    ecmaVersion: 'latest',
    ecmaFeatures: {
      jsx: true,
      experimentalObjectRestSpread: true,
    },
    requireConfigFile: false,
  },
}
