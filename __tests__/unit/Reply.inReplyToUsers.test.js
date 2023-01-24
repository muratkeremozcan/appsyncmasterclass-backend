// [43] Unit test Reply.inReplyToUsers.vtl
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

describe('Reply.inReplyToUsers.request template', () => {
  it("Should not short-circuit if selectionSetList has more than just 'id'", () => {
    // create an appsync context (for $context.identity.username)
    // the 3rd argument is result, which is the result of the previous resolver, needed with nested resolvers
    const username = chance.guid()
    const info = {
      selectionSetList: ['id', 'bio'],
    }
    const context = generateAppSyncContext({
      username,
      source: {inReplyToUserIds: [username]},
      info,
    })

    // get the request template
    const template = getTemplate('Reply.inReplyToUsers.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    result //?
    // check the result
    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'BatchGetItem',
      tables: {
        '${UsersTable}': {
          keys: [
            {
              id: {
                S: username,
              },
            },
          ],
          consistentRead: false,
        },
      },
    })
  })

  it("Should short-circuit if selectionSetList has only 'id'", () => {
    // create an appsync context
    const username1 = chance.guid()
    const username2 = chance.guid()
    const info = {
      selectionSetList: ['id'],
    }
    const context = generateAppSyncContext({
      username: username1,
      source: {inReplyToUserIds: [username1, username2]},
      info,
    })

    // get the request template
    const template = getTemplate('Reply.inReplyToUsers.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    // check the result
    expect(result).toEqual([
      {
        id: username1,
        __typename: 'MyProfile',
      },
      {
        id: username2,
        __typename: 'OtherProfile',
      },
    ])
  })

  it('Should short-circuit if inReplyToUsers array is empty', () => {
    // create an appsync context
    const info = {
      selectionSetList: ['id'],
    }
    const context = generateAppSyncContext({
      source: {inReplyToUserIds: []},
      info,
    })

    // get the request template
    const template = getTemplate('Reply.inReplyToUsers.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual([])
  })
})
