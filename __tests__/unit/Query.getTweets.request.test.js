// [19] unit test for getTweets request
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('Query.getTweets.request template', () => {
  it('Should error if limit is over 25', () => {
    // create an appsync context (for $context.identity.username)
    const username = chance.guid()
    const context = generateAppSyncContext({
      username,
      args: {
        userId: username,
        limit: 26,
        nextToken: null,
      },
    })

    // get the request template
    const template = getTemplate('Query.getTweets.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    // we want the below to throw an error
    // const result = renderTemplate(template, context)
    expect(() => renderTemplate(template, context)).toThrowError(
      'max limit is 25',
    )
  })
})
