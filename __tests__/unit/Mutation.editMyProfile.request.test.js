// [4.8] unit test for getMyProfile query
const chance = require('chance').Chance()
const {
  generateAppSyncContext,
  getTemplate,
  renderTemplate,
} = require('../../test-helpers/mapping-template')

describe('Mutation.editMyProfile.request template', () => {
  it("Should use 'newProfile' fields in expression values", () => {
    // create an appsync context (for $context.identity.username)
    const userName = chance.guid()
    const newProfile = {
      name: 'Murat',
      imageUrl: null,
      backgroundImageUrl: null,
      bio: 'test',
      location: null,
      website: null,
      birthdate: null,
    }
    const context = generateAppSyncContext(userName, {newProfile}) // we need to give it an argument (compared to getMyProfile)

    // get the request template
    const template = getTemplate('Mutation.editMyProfile.request.vtl')

    // use amplify-velocity-template to render the template, given the context
    const result = renderTemplate(template, context)

    expect(result).toEqual({
      version: '2018-05-29',
      operation: 'UpdateItem',
      key: {id: {S: userName}},
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
