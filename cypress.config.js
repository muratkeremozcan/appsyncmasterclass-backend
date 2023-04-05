/* eslint-disable no-unused-vars */
const {defineConfig} = require('cypress')
const tasks = require('./cypress/support/tasks')
require('dotenv').config()

module.exports = defineConfig({
  fixturesFolder: false,
  env: {
    ...process.env,
  },
  e2e: {
    setupNodeEvents(on, config) {
      tasks(on)

      return config
    },
  },
})
