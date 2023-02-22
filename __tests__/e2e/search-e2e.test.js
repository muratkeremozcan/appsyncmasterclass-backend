require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const retry = require('async-retry')
const chance = require('chance').Chance()
const {graphQLQuery, registerFragment} = require('../../test-helpers/graphql')
const {TweetTypes} = require('../../lib/constants')
const {
  getMyProfile,
  searchPeople,
  searchTweets,
  tweet,
  reply,
} = require('../../test-helpers/queries-and-mutations')
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

// works locally, but not in
describe('Given an authenticated user', () => {
  let userA, userAsProfile, tweetAResp, userAsReply, DynamoDB, userAId
  const text = chance.string({length: 16})
  const replyText = chance.string({length: 16})

  beforeAll(async () => {
    userA = await signInUser()
    userAsProfile = await graphQLQuery(userA.accessToken, getMyProfile)
    tweetAResp = await graphQLQuery(userA.accessToken, tweet, {text})
    userAsReply = await graphQLQuery(userA.accessToken, reply, {
      tweetId: tweetAResp.tweet.id,
      text: replyText,
    })
    DynamoDB = new AWS.DynamoDB.DocumentClient()
    userAId = userA.username
  })

  it('The user can find himself when he searches for his twitter handle', async () => {
    await retry(
      async () => {
        const {
          search: {results},
        } = await graphQLQuery(userA.accessToken, searchPeople, {
          query: userAsProfile.getMyProfile.screenName,
          limit: 10,
          nextToken: null,
        })

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
          __typename: 'MyProfile',
          id: userAsProfile.getMyProfile.id,
          name: userAsProfile.getMyProfile.name,
          screenName: userAsProfile.getMyProfile.screenName,
        })
      },
      {
        retries: 5,
        maxTimeout: 5000,
      },
    )
  }, 30000)

  it('The user can find himself when he searches for his name', async () => {
    await retry(
      async () => {
        const {
          search: {results},
        } = await graphQLQuery(userA.accessToken, searchPeople, {
          query: userAsProfile.getMyProfile.name,
          limit: 10,
          nextToken: null,
        })

        expect(results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              __typename: 'MyProfile',
              id: userAsProfile.getMyProfile.id,
              name: userAsProfile.getMyProfile.name,
              screenName: userAsProfile.getMyProfile.screenName,
            }),
          ]),
        )
      },
      {
        retries: 5,
        maxTimeout: 5000,
      },
    )
  }, 30000)

  it('The user can find his tweet when he searches for the text', async () => {
    await retry(async () => {
      const {
        search: {results},
      } = await graphQLQuery(userA.accessToken, searchTweets, {
        query: text,
        limit: 10,
        nextToken: null,
      })

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject(
        {
          __typename: TweetTypes.TWEET,
          id: tweetAResp.tweet.id,
          text,
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })
  }, 30000)

  it('The user can find his reply when he searches for the reply text', async () => {
    await retry(async () => {
      const {
        search: {results},
      } = await graphQLQuery(userA.accessToken, searchTweets, {
        query: replyText,
        limit: 10,
        nextToken: null,
      })

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject(
        {
          __typename: TweetTypes.REPLY,
          id: userAsReply.reply.id,
          text: replyText,
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })
  }, 30000)

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userAId,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetAResp.tweet.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userAId,
        tweetId: tweetAResp.tweet.id,
      },
    }).promise()
    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userAId,
      })
      .promise()
  })
})
