require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/helpers')
const {axiosGraphQLQuery} = require('../../test-helpers/graphql')
const chance = require('chance').Chance()

describe('Given an authenticated user', () => {
  let signedInUser
  beforeAll(async () => {
    signedInUser = await signInUser()
  })

  it('should write the tweet to the Tweets, Timelines tables, and update Users table', async () => {
    // [4.16] E2e test for tweet mutation
    // send a graphQL query request as the user
    // we can copy the tweet mutation from Appsync console
    // we are taking a text argument, mirroring the type at schema.api.graphql
    const tweet = `mutation tweet($text: String!) {
      tweet(text: $text) {
        id
        createdAt
        text
        replies
        likes
        retweets
      }
    }`
    const text = chance.string({length: 16})

    // Make a graphQL request with the tweet mutation and its text argument
    const tweetResp = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      tweet,
      {text},
    )

    // Check the content of the response for the  mutation (no need to repeat the integration test DDB verifications,
    // so long as we got a response, DDB transactions already happened).
    expect(tweetResp.tweet).toMatchObject({
      text,
      replies: 0,
      likes: 0,
      retweets: 0,
    })

    // [4.18] E2e test for getTweets query
    const getTweets = `query getTweets($userId: ID!, $limit: Int!, $nextToken: String) {
      getTweets(userId: $userId, limit: $limit, nextToken: $nextToken) {
        nextToken
        tweets {
          id
          createdAt
          profile {
            id
            name
            screenName
          }

          ... on Tweet {
            text
            replies
            likes
            retweets
          }
        }
      }
    }`

    const getTweetsResp = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getTweets,
      {userId: signedInUser.id, limit: 25, nextToken: null},
    )
    expect(getTweetsResp.getTweets.nextToken).toBeNull()
    expect(getTweetsResp.getTweets.tweets).toHaveLength(25)
    expect(getTweetsResp.getTweets.tweets[0]).toMatchObject(tweetResp.tweet)

    // cannot ask for more than 25
    const get26Tweets = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getTweets,
      {userId: signedInUser.id, limit: 26, nextToken: null},
    )
    await expect(get26Tweets).rejects.toMatchObject({
      message: expect.stringContaining('max limit is 25'),
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
