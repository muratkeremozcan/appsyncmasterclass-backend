import spok from 'cy-spok'
const {
  getMyProfile,
  editMyProfile,
} = require('../../test-helpers/queries-and-mutations')
const chance = require('chance').Chance()

describe('Given an authenticated user', () => {
  let token
  let id

  before(() => {
    cy.task('signInUser').then(({username, idToken}) => {
      id = username
      token = idToken
    })
  })

  const matchProfile = {
    name: spok.string,
    imageUrl: null,
    backgroundImageUrl: null,
    bio: null,
    location: null,
    website: null,
    birthdate: null,
    createdAt: s =>
      expect(s).to.match(
        /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?Z?/g,
      ),
    followersCount: spok.number,
    followingCount: spok.number,
    tweetsCount: spok.number,
    likesCounts: spok.number,
  }

  it('The user can fetch his profile with getMyProfile', () => {
    cy.gql({token, query: getMyProfile})
      .its('getMyProfile')
      .should(spok({id, ...matchProfile}))
  })

  it('The user can edit their profile with editMyProfile', () => {
    const newName = chance.first()

    cy.gql({
      token,
      query: editMyProfile,
      variables: {input: {name: newName}},
    })
      .its('editMyProfile')
      .should(spok({id, name: newName, ...matchProfile}))
  })

  after(() => {
    cy.task('ddbDeleteUser', id)

    cy.task('cognitoDeleteUser', id)
  })
})
