// [52] distribute-tweets integration test
// - Create an event object (this time we are getting it from json files), and modify it to match the test case
// - Feed it to the handler
// - Check that the result matches the expectation

// The main idea is that we invoke the lambda handler locally and pass an event object to it.
// Shaping that object can be in any way; our own object, a json, as long as it looks like it's coming from DDB.
require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const handler = require('../../functions/distribute-tweets-to-follower').handler
const tweetHandler = require('../../functions/tweet').handler
const {registerFragment} = require('../../test-helpers/graphql')
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

describe('Given 2 authenticated users, userA has 2 tweets', () => {
  let userA, userAId, userB, userBId, userAsTweet1, userAsTweet2, DynamoDB
  beforeAll(async () => {
    userA = await signInUser()
    userB = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()
    userAId = userA.username
    userBId = userB.username

    const generateTweetEvent = (username, text) => {
      return {
        identity: {
          username: username,
        },
        arguments: {
          text,
        },
      }
    }

    userAsTweet1 = await tweetHandler(
      generateTweetEvent(userAId, 'Hello world!'),
      {},
    )
    userAsTweet2 = await tweetHandler(
      generateTweetEvent(userAId, 'Goodbye world!'),
      {},
    )
  })

  describe('userB follows userA', () => {
    beforeAll(async () => {})

    it("should add userA's tweets to userB's timeline when userB follows userA", async () => {
      // we are getting the event object from a json file
      // and then modifying it to match our test case
      const followEvent = require('../../test-helpers/data/new-follower.json')
      const {NewImage} = followEvent.Records[0].dynamodb
      NewImage.userId.S = userBId
      NewImage.otherUserId.S = userAId
      NewImage.sk.S = `FOLLOWS_${userAId}`
      // and then later feeding it to the handler
      await handler(followEvent, {})

      // check that userB's timeline contains userA's tweets
      const timelinesTableResp = await DynamoDB.get({
        TableName: process.env.TIMELINES_TABLE,
        Key: {
          userId: userBId,
          tweetId: userAsTweet1.id,
        },
      }).promise()
      expect(timelinesTableResp.Item).toBeTruthy()

      const timelinesTableResp2 = await DynamoDB.get({
        TableName: process.env.TIMELINES_TABLE,
        Key: {
          userId: userBId,
          tweetId: userAsTweet2.id,
        },
      }).promise()
      expect(timelinesTableResp2.Item).toBeTruthy()

      // should remove userA's tweets from userB's timeline when userB unfollows userA
      const unfollowEvent = require('../../test-helpers/data/delete-follower.json')
      const {OldImage} = unfollowEvent.Records[0].dynamodb
      OldImage.userId.S = userBId
      OldImage.otherUserId.S = userAId
      OldImage.sk.S = `FOLLOWS_${userAId}`

      await handler(unfollowEvent, {})

      const timelinesTableResp3 = await DynamoDB.get({
        TableName: process.env.TIMELINES_TABLE,
        Key: {
          userId: userBId,
          tweetId: userAsTweet1.id,
        },
      }).promise()
      expect(timelinesTableResp3.Item).toBeFalsy()

      const timelinesTableResp4 = await DynamoDB.get({
        TableName: process.env.TIMELINES_TABLE,
        Key: {
          userId: userBId,
          tweetId: userAsTweet2.id,
        },
      }).promise()
      expect(timelinesTableResp4.Item).toBeFalsy()
    })
  })

  afterAll(async () => {
    // nothing goes to timelines table or tweets table, no need to clean up

    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userAId,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userBId,
      },
    }).promise()
    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userAId,
      })
      .promise()
    await userB.cognito
      .adminDeleteUser({
        UserPoolId: userB.userPoolId,
        Username: userBId,
      })
      .promise()
  })
})
