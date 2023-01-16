// [19] unit test for tweetProfile request
// - Create an AppSync context
// - Get the template
// - Use `amplify-velocity-template` to render the template, given the context
// - Check the result
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('Tweet.profile.request template', () => {
  it("Should not short-circuit if selectionSetList has more than just 'id'", () => {
    // create an appsync context (for $context.identity.username)
    // the 3rd argument is result, which is the result of the previous resolver, needed with nested resolvers
    const username = chance.guid()
    const info = {
      selectionSetList: ['id', 'bio'],
    }
    const context = generateAppSyncContext({
      username,
      source: {creator: username},
      info,
    })

    // get the request template
    const template = getTemplate('Tweet.profile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    result //?
    // check the result
    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'GetItem',
      key: {
        id: {
          S: username,
        },
      },
    })
  })

  it("Should short-circuit if selectionSetList has only 'id'", () => {
    // create an appsync context
    const username = chance.guid()
    const info = {
      selectionSetList: ['id'],
    }
    const context = generateAppSyncContext({
      username,
      source: {creator: username},
      info,
    })

    // get the request template
    const template = getTemplate('Tweet.profile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    // check the result
    expect(result).toEqual({
      id: username,
      __typename: 'MyProfile',
    })
  })
})
