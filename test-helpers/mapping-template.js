const path = require('path')
const velocityUtil = require('amplify-appsync-simulator/lib/velocity/util')
const fs = require('fs')
const velocityMapper = require('amplify-appsync-simulator/lib/velocity/value-mapper/mapper')
const velocityTemplate = require('amplify-velocity-template')

/**
 * Used to generate a context for the mapping template (for  $context.identity.username)
 * @param {string} username the username as in `$context.identity.username`
 * @param {*} args Optional arguments to pass to the template
 * @returns {object} the context
 */
const generateAppSyncContext = (username, args) => {
  const util = velocityUtil.create([], new Date(), Object())
  const context = {
    identity: {
      username: username,
    },
    args,
    arguments: args,
  }
  return {
    context,
    ctx: context,
    util,
    utils: util,
  }
}

/**
 * Used to get the contents of a mapping template (the .vtl file) as a string
 * @param {string} fileName
 * @returns {string} the file contents as a string
 */
const getTemplate = fileName => {
  const templatePath = path.resolve(`./mapping-templates/${fileName}`)
  return fs.readFileSync(templatePath, 'utf-8')
}

/**
 * Uses amplify-velocity-template to render the template, given the context
 * @param {*} template
 * @param {*} context
 * @returns {object} the rendered template as a JSON object
 */
const renderTemplate = (template, context) => {
  const parsedTemplate = velocityTemplate.parse(template)
  const compiler = new velocityTemplate.Compile(parsedTemplate, {
    valueMapper: velocityMapper.map,
    // escape: false, // examples have it, but it works without it
  })
  return JSON.parse(compiler.render(context))
}

module.exports = {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
}
