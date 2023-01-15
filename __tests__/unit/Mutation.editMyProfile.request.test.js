// [13] unit test for editMyProfile mutation
// We are going to test that `Mutation.editMyProfile.request.vtl`
// executes the template with `$context.identity.username` and turns it into a DDB json structure.

// - Create an AppSync context that contains the username (for`$context.identity.username`).
/// KEY: when generating the context we need to give it an argument (editMyProfile(newProfile: ProfileInput!): MyProfile!).
// - Get the template (file `Mutation.editMyProfile.request.vtl`).
// - Render the template (using the utility npm packages).
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('Mutation.editMyProfile.request template', () => {
  it("Should use 'newProfile' fields in expression values", () => {
    // create an appsync context (for $context.identity.username)
    const username = chance.guid()
    const newProfile = {
      name: 'Murat',
      imageUrl: null,
      backgroundImageUrl: null,
      bio: 'test',
      location: null,
      website: null,
      birthdate: null,
    }
    // we need to give it an argument (editMyProfile(newProfile: ProfileInput!): MyProfile!).
    const context = generateAppSyncContext(username, {newProfile})

    // get the request template
    const template = getTemplate('Mutation.editMyProfile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'UpdateItem',
      key: {id: {S: username}},
      update: {
        expression:
          'set #name = :name, imageUrl = :imageUrl, backgroundImageUrl = :backgroundImageUrl, bio = :bio, #location = :location, website = :website, birthdate = :birthdate',
        expressionNames: {'#name': 'name', '#location': 'location'},
        expressionValues: {
          ':name': {S: 'Murat'},
          ':imageUrl': {NULL: true},
          ':backgroundImageUrl': {NULL: true},
          ':bio': {S: 'test'},
          ':location': {NULL: true},
          ':website': {NULL: true},
          ':birthdate': {NULL: true},
        },
      },
      condition: {expression: 'attribute_exists(id)'},
    })
  })
})
