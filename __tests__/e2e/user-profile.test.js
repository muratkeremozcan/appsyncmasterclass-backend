require('dotenv').config()
const {signInUser} = require('../../test-helpers/helpers')
const {axiosGraphQLQuery} = require('../../test-helpers/graphql')
const AWS = require('aws-sdk')
const chance = require('chance').Chance()

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
				backgroundImageUrl
				bio
				birthdate
				createdAt
				followersCount
				followingCount
				id
				imageUrl
				likesCounts
				location
				name
				screenName
				tweetsCount
				website
			}
		}`
    const data = await axiosGraphQLQuery(
      process.env.API_URL,
      getMyProfile,
      {},
      signedInUser.accessToken,
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
    // we can copy the query from the AppSync console
    const editMyProfile = `mutation editMyProfile($input: ProfileInput!) {
      editMyProfile(newProfile: $input) {
        backgroundImageUrl
        bio
        birthdate
        createdAt
        followersCount
        followingCount
        id
        imageUrl
        likesCounts
        location
        name
        screenName
        tweetsCount
        website
      }
    }`

    const newName = chance.first()
    const data = await axiosGraphQLQuery(
      process.env.API_URL,
      editMyProfile,
      {input: {name: newName}},
      signedInUser.accessToken,
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
