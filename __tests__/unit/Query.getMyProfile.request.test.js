// [4.8] unit test for getMyProfile query
const chance = require('chance').Chance()
const path = require('path')
const velocityUtil = require('amplify-appsync-simulator/lib/velocity/util')
const fs = require('fs')
const velocityMapper = require('amplify-appsync-simulator/lib/velocity/value-mapper/mapper')
const velocityTemplate = require('amplify-velocity-template')

const generateAppSyncContext = (userName, args) => {
  const util = velocityUtil.create([], new Date(), Object())
  const context = {
    identity: {
      username: userName,
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

const getTemplate = fileName => {
  const templatePath = path.resolve(
    __dirname,
    `../../mapping-templates/${fileName}`,
  )
  return fs.readFileSync(templatePath, 'utf-8')
}

const renderTemplate = (template, context) => {
  const parsedTemplate = velocityTemplate.parse(template)
  const compiler = new velocityTemplate.Compile(parsedTemplate, {
    valueMapper: velocityMapper.map,
    // escape: false, // examples have it, but it works without it
  })
  return JSON.parse(compiler.render(context))
}

describe('Query.getMyProfile.request template', () => {
  it('Should execute the template with $context.identity.username and turn it into a DDB json structure', () => {
    // create an appsync context (for $context.identity.username)
    const userName = chance.guid()
    const context = generateAppSyncContext(userName, {})

    // get the request template
    const template = getTemplate('Query.getMyProfile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'GetItem',
      key: {
        id: {S: userName},
      },
    })
  })
})
