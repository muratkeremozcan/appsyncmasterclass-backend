/* eslint-disable no-unused-vars */
const {defineConfig} = require('cypress')
require('dotenv').config()

module.exports = defineConfig({
  env: {
    ...process.env,
  },
  e2e: {
    setupNodeEvents(on, config) {},
  },
})
