// [43] reply integration test
// - Create an event: an object which includes `identity.username` and `arguments.tweetId` and `arguments.text`.
// - Feed it to the handler (the handler causes writes and updates to DDB, hence the "integration")
// - Check that the result matches the expectation (by reading the 3 tables from DDB, hence "integration")
require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const handler = require('../../functions/reply').handler
const {graphQLQuery, registerFragment} = require('../../test-helpers/graphql')
const {tweet} = require('../../test-helpers/queries-and-mutations')
const chance = require('chance').Chance()
const {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
} = require('../../test-helpers/graphql-fragments')
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)

/**
 * Generates an event object that can be used to test the lambda function
 * @param {string} username - the id of the user who is tweeting
 * @param {string} tweetId - the id of the tweet to reply
 * @returns {Object} - event
 */
const generateReplyEvent = (username, tweetId, text) => {
  return {
    identity: {
      username,
    },
    arguments: {
      tweetId,
      text,
    },
  }
}

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

describe('Given 2 authenticated users and a tweet', () => {
  let userA, tweetA, userId, tweetId, userB, userBId, DynamoDB
  beforeAll(async () => {
    userA = await signInUser()
    userB = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()

    // send a graphQL query request as the user
    const text = chance.string({length: 16})
    // Make a graphQL request with the tweet mutation and its text argument
    tweetA = await graphQLQuery(userA.accessToken, tweet, {text})
    tweetId = tweetA.tweet.id
    userId = userA.username
    userBId = userB.username
  })

  it('reply to other: should save the tweet in Tweets table, increment the count in Tweets and Users table, save to timelines table', async () => {
    const replyText = chance.string({length: 16})
    // create a mock event and feed it to the handler
    const event = generateReplyEvent(userBId, tweetId, replyText)
    const context = {}
    await handler(event, context)

    // save the reply in Tweets
    // increment the count in Tweets table
    const tweetsTableResp = await DynamoDB.get({
      TableName: TWEETS_TABLE,
      Key: {
        id: tweetId,
      },
    }).promise()
    expect(tweetsTableResp.Item).toBeTruthy()

    // increment the count in Users table
    const usersTableResp = await DynamoDB.get({
      TableName: USERS_TABLE,
      Key: {
        id: userId,
      },
    }).promise()
    expect(usersTableResp.Item).toBeTruthy()
    expect(usersTableResp.Item.tweetsCount).toEqual(1)

    // save to timelines table
    const timelinesTableResp = await DynamoDB.get({
      TableName: TIMELINES_TABLE,
      Key: {
        userId,
        tweetId,
      },
    }).promise()
    expect(timelinesTableResp.Item).toBeTruthy()
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: TWEETS_TABLE,
      Key: {
        id: tweetId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: TIMELINES_TABLE,
      Key: {
        userId: userId,
        tweetId: tweetId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: USERS_TABLE,
      Key: {
        id: userId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: USERS_TABLE,
      Key: {
        id: userBId,
      },
    }).promise()

    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userId,
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
