// [23] unit test for TimelinePage.tweets.request.vtl
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('TimelinePage.tweets.request template', () => {
  it('Should return empty array if source.tweets is empty', () => {
    // create an appsync context (for $context.source.tweets))
    const username = chance.guid()
    const context = generateAppSyncContext({username, source: {tweets: []}})

    // get the request template
    const template = getTemplate('TimelinePage.tweets.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual([])
  })

  it('Should return empty array if source.tweets is empty', () => {
    // create an appsync context (for $context.source.tweets))
    const username = chance.guid()
    const tweetId = chance.guid()
    const tweets = [
      {
        userId: username,
        tweetId,
      },
    ]
    const context = generateAppSyncContext({username, source: {tweets}})

    // get the request template
    const template = getTemplate('TimelinePage.tweets.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'BatchGetItem',
      tables: {
        '${TweetsTable}': {
          keys: [
            {
              id: {
                S: tweetId,
              },
            },
          ],
          consistentRead: false,
        },
      },
    })
  })
})
