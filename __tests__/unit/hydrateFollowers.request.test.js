// [61] Unit test hyrdrateFollowers.request

// - Create an AppSync context
// - Get the template
// - Render the template (using the utility npm packages)

const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('hydrateFollowers.request template', () => {
  it('Should return empty array if prev.result.relationships is empty', () => {
    // create an appsync context
    const username = chance.guid()
    const prev = {
      result: {
        relationships: [],
      },
    }

    const context = generateAppSyncContext({username, prev})

    // get the request template
    const template = getTemplate('hydrateFollowers.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({profiles: []})
  })

  it('Should convert relationships to BatchGetItem keys', () => {
    const username = chance.guid()
    const userId = chance.guid()
    const otherUserId = chance.guid()
    const relationships = [
      {
        userId,
        sk: `FOLLOWS_${otherUserId}`,
        otherUserId,
      },
    ]
    const prev = {
      result: {
        relationships,
      },
    }

    const context = generateAppSyncContext({username, prev})

    const template = getTemplate('hydrateFollowers.request.vtl')

    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'BatchGetItem',
      tables: {
        '${UsersTable}': {
          keys: [
            {
              id: {
                S: userId,
              },
            },
          ],
          consistentRead: false,
        },
      },
    })
  })
})
