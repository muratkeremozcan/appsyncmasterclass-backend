// [19] E2e test for tweet mutation
/// As a signed in user, make a graphQL request with the mutation `tweet`.
/// This will cause 3 db interactions. We do not have to repeat the same DB verifications as the integration test,
/// but we can verify the response from the mutation.
// - Sign in
// - Make a graphQL request with the tweet mutation and its text argument.
// - Check the content of the response for the mutation
// [24] E2e test for getMyTimeline query
// - Create the tweet (17)
// - getMyTimeline
// - Test error case of 26 limit.
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
    // [19] E2e test for tweet mutation
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
        liked
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
      liked: false,
    })

    // [18] E2e test for getTweets query
    // create the query
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
            liked
          }
        }
      }
    }`

    // make a graphQL request and check the response
    const getTweetsResp = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getTweets,
      {userId: signedInUser.username, limit: 25, nextToken: null},
    )
    expect(getTweetsResp.getTweets.nextToken).toBeNull()
    expect(getTweetsResp.getTweets.tweets).toHaveLength(1)
    expect(getTweetsResp.getTweets.tweets[0]).toMatchObject(tweetResp.tweet)

    // cannot ask for more than 25
    const get26Tweets = axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getTweets,
      {userId: signedInUser.username, limit: 26, nextToken: null},
    )
    await expect(get26Tweets).rejects.toMatchObject({
      message: expect.stringContaining('max limit is 25'),
    })

    // [24] E2e test for getTimeline query
    // create the query
    const getMyTimeline = `query getMyTimeline($limit: Int!, $nextToken: String) {
      getMyTimeline(limit: $limit, nextToken: $nextToken) {
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
            liked
          }
        }
      }
    }`

    // make a graphQL request and check the response
    const getMyTimelineResp = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getMyTimeline,
      {limit: 25, nextToken: null},
    )
    expect(getMyTimelineResp.getMyTimeline.nextToken).toBeNull()
    expect(getMyTimelineResp.getMyTimeline.tweets).toHaveLength(1)
    expect(getMyTimelineResp.getMyTimeline.tweets[0]).toMatchObject(
      tweetResp.tweet,
    )

    // cannot ask for more than 25
    const get26MyTimeline = axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      getMyTimeline,
      {limit: 26, nextToken: null},
    )
    await expect(get26MyTimeline).rejects.toMatchObject({
      message: expect.stringContaining('max limit is 25'),
    })

    // clean up
    const DynamoDB = new AWS.DynamoDB.DocumentClient()
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetResp.tweet.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: signedInUser.username,
      },
    }).promise()
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
