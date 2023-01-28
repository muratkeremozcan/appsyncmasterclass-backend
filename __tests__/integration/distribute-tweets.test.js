// [52] distribute-tweets integration test
// - Create an event object (this time we are getting it from json files), and modify it to match the test case
// - Feed it to the handler
// - Check that the result matches the expectation

// The main idea is that we invoke the lambda handler locally and pass an event object to it.
// Shaping that object can be in any way; our own object, a json, as long as it looks like it's coming from DDB.
require('dotenv').config()
const AWS = require('aws-sdk')
const DocumentClient = new AWS.DynamoDB.DocumentClient()
const {signInUser} = require('../../test-helpers/cognito')
const handler = require('../../functions/distribute-tweets').handler
const chance = require('chance').Chance()
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

const {RELATIONSHIPS_TABLE} = process.env

describe('Given 2 authenticated users and userA follows B', () => {
  let userA, userAId, userB, userBId, DynamoDB
  beforeAll(async () => {
    userA = await signInUser()
    userB = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()
    userAId = userA.username
    userBId = userB.username
    // we could use the tweet mutation to have userA follow userB as we did in the e2e
    // await axiosGraphQLQuery(userA.accessToken, follow, {
    // 	userId: userB.username,
    // })
    // but using the DynamoDB client is less expensive
    await DocumentClient.put({
      TableName: RELATIONSHIPS_TABLE,
      Item: {
        userId: userAId,
        sk: `FOLLOWS_${userBId}`,
        otherUserId: userBId,
        createdAt: new Date().toJSON(),
      },
    }).promise()
  })

  it("should add userB's tweet to userA's timeline when user B tweets", async () => {
    // userB tweets

    // this time we are getting the event object from a json file
    const newTweetEvent = require('../../test-helpers/data/new-tweet.json')
    const {NewImage} = newTweetEvent.Records[0].dynamodb
    // and then modifying it to match our test case
    const tweetId = chance.guid()
    NewImage.creator.S = userB.username
    NewImage.id.S = tweetId
    const context = {}
    // and then later feeding it to the handler
    await handler(newTweetEvent, context)

    // check that userA's timeline contains userB's tweet
    const timelinesTableResp = await DynamoDB.get({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userAId,
        tweetId,
      },
    }).promise()
    expect(timelinesTableResp.Item).toBeTruthy()

    // should remove userB's tweet from userA's timeline when user B deletes the tweet

    // get the event object from a json file
    const deleteTweetEvent = require('../../test-helpers/data/delete-tweet.json')
    const {OldImage} = deleteTweetEvent.Records[0].dynamodb
    // and then modifying it to match our test case
    OldImage.creator.S = userB.username
    OldImage.id.S = tweetId
    // and then later feeding it to the handler
    await handler(deleteTweetEvent, context)

    // check that userA's timeline does not contain userB's tweet
    const timelinesTableResp2 = await DynamoDB.get({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userAId,
        tweetId,
      },
    }).promise()
    expect(timelinesTableResp2.Item).toBeFalsy()
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
