// [9] e2e test getMyProfile
// - Sign in
// - Make a graphQL request with the query
// - Confirm that the returned profile is in the shape of the query.

// [14] editMyProfile
// As a signed in user, make a graphQL request with the query `editMyProfile`.
// - Sign in
// - Make a graphQL request with the query and variable
// - Confirm that the returned profile has been edited
require('dotenv').config()
const {signInUser} = require('../../test-helpers/cognito')
const AWS = require('aws-sdk')
const chance = require('chance').Chance()
// (28.2) import the fragments we will use in the test and register them
const {
  axiosGraphQLQuery,
  registerFragment,
} = require('../../test-helpers/graphql')
const {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
  tweetFragment,
  iTweetFragment,
  retweetFragment,
  replyFragment,
} = require('../../test-helpers/graphql-fragments')
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)
registerFragment('tweetFields', tweetFragment)
registerFragment('iTweetFields', iTweetFragment)
registerFragment('retweetFields', retweetFragment)
registerFragment('replyFields', replyFragment)

describe('Given an authenticated user', () => {
  let signedInUser
  beforeAll(async () => {
    signedInUser = await signInUser()
  })

  it('The user can fetch his profile with getMyProfile', async () => {
    // as the signed in user, make a request
    // we can copy the query from the AppSync console
    const getMyProfile = `query getMyProfile {
      getMyProfile {
        ... myProfileFields
  
        tweets {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }
    }`
    const data = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getMyProfile,
    )
    const profile = data.getMyProfile

    expect(profile).toMatchObject({
      id: signedInUser.username,
      name: signedInUser.name,
      imageUrl: null,
      backgroundImageUrl: null,
      bio: null,
      location: null,
      website: null,
      birthdate: null,
      createdAt: expect.stringMatching(
        /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?Z?/g,
      ),
      // tweets
      followersCount: 0,
      followingCount: 0,
      tweetsCount: 0,
      likesCounts: 0,
    })

    const [firstName, lastName] = profile.name.split(' ')
    expect(profile.screenName).toContain(firstName)
    expect(profile.screenName).toContain(lastName)
  })

  it('The user can edit their profile with editMyProfile', async () => {
    // as the signed in user, make a request
    // we can copy the query from the AppSync console,
    // here we are taking an input as a parameter, mirroring the type at schema.api.graphql
    // editMyProfile(newProfile: ProfileInput!): MyProfile!
    const editMyProfile = `mutation editMyProfile($input: ProfileInput!) {
      editMyProfile(newProfile: $input) {
        ... myProfileFields
  
        tweets {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }
    }`

    // Make a graphQL request with the query and variables
    const newName = chance.first()
    const data = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      editMyProfile,
      {input: {name: newName}},
    )
    const profile = data.editMyProfile

    expect(profile).toMatchObject({
      ...profile,
      name: newName,
    })
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    const DynamoDB = new AWS.DynamoDB.DocumentClient()
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: signedInUser.username,
      },
    }).promise()

    await signedInUser.cognito
      .adminDeleteUser({
        UserPoolId: signedInUser.userPoolId,
        Username: signedInUser.username,
      })
      .promise()
  })
})
