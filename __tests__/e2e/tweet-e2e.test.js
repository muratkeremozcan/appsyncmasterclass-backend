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
} = require('../../test-helpers/graphql-fragments')
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)
registerFragment('tweetFields', tweetFragment)
registerFragment('iTweetFields', iTweetFragment)

describe('e2e test for tweet', () => {
  let signedInUser, DynamoDB, tweetResp

  const text = chance.string({length: 16})

  // [18] E2e test for getTweets query
  // create the query
  const getTweets = `query getTweets($userId: ID!, $limit: Int!, $nextToken: String) {
    getTweets(userId: $userId, limit: $limit, nextToken: $nextToken) {
      nextToken
      tweets {
        ... iTweetFields
        }
      }
    }`

  beforeAll(async () => {
    signedInUser = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()

    // [19] E2e test for tweet mutation
    // send a graphQL query request as the user
    // we can copy the tweet mutation from Appsync console
    // we are taking a text argument, mirroring the type at schema.api.graphql
    const tweet = `mutation tweet($text: String!) {
      tweet(text: $text) {
        id
        profile {
          ... iProfileFields
        }
        createdAt
        text
        replies
        likes
        retweets
        liked
      }
    }`

    // Make a graphQL request with the tweet mutation and its text argument
    tweetResp = await axiosGraphQLQuery(
      process.env.API_URL,
      signedInUser.accessToken,
      tweet,
      {text},
    )
  })

  it('[19] mutation; should check the content of the response', async () => {
    // Check the content of the response for the  mutation (no need to repeat the integration test DDB verifications,
    // so long as we got a response, DDB transactions already happened).
    expect(tweetResp.tweet).toMatchObject({
      text,
      replies: 0,
      likes: 0,
      retweets: 0,
      liked: false,
    })
  })

  it('[18] getTweets query', async () => {
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
  })

  it('[24] getTimeline query', async () => {
    // create the query
    const getMyTimeline = `query getMyTimeline($limit: Int!, $nextToken: String) {
      getMyTimeline(limit: $limit, nextToken: $nextToken) {
        nextToken
        tweets {
          ... iTweetFields
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
  })

  describe('[29] [33] [31] like, getLikes, unlike', () => {
    const like = `mutation like($tweetId: ID!) {
      like(tweetId: $tweetId)
    }`
    // [33] getLikes query
    // create the query
    const getLikes = `query getLikes($userId: ID!, $limit: Int!, $nextToken: String) {
        getLikes(userId: $userId, limit: $limit, nextToken: $nextToken) {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }`
    beforeAll(async () => {
      // [29] like the tweet
      await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        like,
        {tweetId: tweetResp.tweet.id},
      )
    })

    it('[29] like mutation, [33] getLikes query: should update the tweet to liked and check it', async () => {
      const getTweetsResp = await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        getTweets,
        {userId: signedInUser.username, limit: 25, nextToken: null},
      )
      expect(getTweetsResp.getTweets.tweets[0].liked).toBe(true)
      // cannot like the same tweet twice
      await expect(
        axiosGraphQLQuery(process.env.API_URL, signedInUser.accessToken, like, {
          tweetId: tweetResp.tweet.id,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('DynamoDB transaction error'),
      })

      // [33] getLikes query
      // make a graphQL request and check the response
      const getLikesResp = await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        getLikes,
        {userId: signedInUser.username, limit: 25, nextToken: null},
      )
      expect(getLikesResp.getLikes.nextToken).toBeNull()
      expect(getLikesResp.getLikes.tweets).toHaveLength(1)
      expect(getLikesResp.getLikes.tweets[0]).toMatchObject({
        ...tweetResp.tweet,
        liked: true,
        likes: 1,
        profile: {
          ...tweetResp.tweet.profile,
          likesCounts: 1,
        },
      })
    })

    it('[31] unlike mutation, [33] getLikes query: should update the tweet to un-liked and check it', async () => {
      const unlike = `mutation unlike($tweetId: ID!) {
        unlike(tweetId: $tweetId)
      }`
      await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        unlike,
        {tweetId: tweetResp.tweet.id},
      )
      const getTweetsResp = await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        getTweets,
        {userId: signedInUser.username, limit: 25, nextToken: null},
      )
      expect(getTweetsResp.getTweets.tweets[0].liked).toBe(false)

      // [33] getLikes and ensure we do not get anything
      const getLikesResp = await axiosGraphQLQuery(
        process.env.API_URL,
        signedInUser.accessToken,
        getLikes,
        {userId: signedInUser.username, limit: 25, nextToken: null},
      )
      expect(getLikesResp.getLikes.nextToken).toBeNull()
      expect(getLikesResp.getLikes.tweets).toHaveLength(0)
    })
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: signedInUser.username,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetResp.tweet.id,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: signedInUser.username,
        tweetId: tweetResp.tweet.id,
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
