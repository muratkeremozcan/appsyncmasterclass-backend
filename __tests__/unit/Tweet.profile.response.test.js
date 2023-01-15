// [19] unit test for tweetProfile response
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

describe('Tweet.profile.response template', () => {
  it("Should set __typename as 'MyProfile' for current user", () => {
    // create an appsync context (for $context.identity.username)
    // the 3rd argument is result, which is the result of the previous resolver, needed with nested resolvers
    const username = chance.guid()
    const context = generateAppSyncContext(username, {}, {id: username})

    // get the request template
    const template = getTemplate('Tweet.profile.response.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    result //?
    // check the result
    expect(result).toEqual({
      __typename: 'MyProfile',
      id: username,
    })
  })

  it("Should set __typename as 'OtherProfile' for other users", () => {
    // create an appsync context
    const username = chance.guid()
    const id = chance.guid()
    const context = generateAppSyncContext(username, {}, {id})

    // get the request template
    const template = getTemplate('Tweet.profile.response.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    result //?
    // check the result
    expect(result).toEqual({
      __typename: 'OtherProfile',
      id,
    })
  })
})
