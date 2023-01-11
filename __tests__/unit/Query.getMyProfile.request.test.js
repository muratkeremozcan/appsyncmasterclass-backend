// [4.8] unit test for getMyProfile query
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('Query.getMyProfile.request template', () => {
  it('Should execute the template with $context.identity.username and turn it into a DDB json structure', () => {
    // create an appsync context (for $context.identity.username)
    const username = chance.guid()
    const context = generateAppSyncContext(username, {})

    // get the request template
    const template = getTemplate('Query.getMyProfile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'GetItem',
      key: {
        id: {S: username},
      },
    })
  })
})
