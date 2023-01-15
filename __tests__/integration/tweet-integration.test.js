// [16] Integration test for tweet mutation
/// We have to have a real user for this integration test, but it is still an integration test
/// given that we are feeding an event object to the handler.
// - Create an event: an object which includes `identity.username` and `arguments.text`.
// - Feed it to the handler (the handler causes 2 writes and update to DDB, hence the "integration")
// - Check that the result matches the expectation (by reading the 3 tables from DDB, hence "integration")
require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/helpers')
const handler = require('../../functions/tweet').handler

/**
 * Generates an event object that can be used to test the lambda function
 * @param {string} username - the id of the user who is tweeting
 * @param {string} text - the text of the tweet
 * @returns {Object} - event
 */
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

describe('Given an authenticated user', () => {
  let signedInUser
  beforeAll(async () => {
    signedInUser = await signInUser()
  })

  it('should write the tweet to the Tweets, Timelines tables, and update Users table', async () => {
    // create a mock event and feed it to the handler
    const event = generateTweetEvent(signedInUser.username, 'Hello world!')
    const context = {}
    const tweet = await handler(event, context)

    // verify the tables
    const DynamoDB = new AWS.DynamoDB.DocumentClient()

    const tweetsTableResp = await DynamoDB.get({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweet.id,
      },
    }).promise()
    expect(tweetsTableResp.Item).toBeTruthy()

    const timelinesTableResp = await DynamoDB.get({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: signedInUser.username,
        tweetId: tweet.id,
      },
    }).promise()
    expect(timelinesTableResp.Item).toBeTruthy()

    const usersTableResp = await DynamoDB.get({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: signedInUser.username,
      },
    }).promise()
    expect(usersTableResp.Item).toBeTruthy()
    expect(usersTableResp.Item.tweetsCount).toEqual(1)

    // clean up
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweet.id,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: signedInUser.username,
        tweetId: tweet.id,
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
