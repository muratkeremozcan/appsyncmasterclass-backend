/* eslint-disable no-unused-vars */
const {defineConfig} = require('cypress')
const tasks = require('./cypress/support/tasks')
require('dotenv').config()

module.exports = defineConfig({
  fixturesFolder: false,
  viewportWidth: 1380,
  viewportHeight: 1080,
  env: {
    ...process.env,
  },
  e2e: {
    baseUrl: process.env.API_URL,
    setupNodeEvents(on, config) {
      tasks(on)

      return config
    },
  },
})
