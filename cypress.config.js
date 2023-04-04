/* eslint-disable no-unused-vars */
const {defineConfig} = require('cypress')
require('dotenv').config()

module.exports = defineConfig({
  fixturesFolder: false,
  env: {
    ...process.env,
  },
  e2e: {
    setupNodeEvents(on, config) {},
  },
})
