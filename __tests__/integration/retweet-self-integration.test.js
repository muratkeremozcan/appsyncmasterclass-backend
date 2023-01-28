// [37] retweet integration test
// - Create an event: an object which includes `identity.username` and `arguments.tweetId`.
// - Feed it to the handler (the handler causes writes and updates to DDB, hence the "integration")
// - Check that the result matches the expectation (by reading the 4 tables from DDB, hence "integration")
require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const handler = require('../../functions/retweet').handler
const {
  axiosGraphQLQuery,
  registerFragment,
} = require('../../test-helpers/graphql')
const {tweet} = require('../../test-helpers/queries-and-mutations')
const {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
} = require('../../test-helpers/graphql-fragments')
const chance = require('chance').Chance()
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)

/**
 * Generates an event object that can be used to test the lambda function
 * @param {string} username - the id of the user who is tweeting
 * @param {string} tweetId - the id of the tweet to retweet
 * @returns {Object} - event
 */
const generateReTweetEvent = (username, tweetId) => {
  return {
    identity: {
      username: username,
    },
    arguments: {
      tweetId,
    },
  }
}

describe('Given an authenticated user with a tweet', () => {
  let userA, tweetA, userId, tweetId, DynamoDB
  beforeAll(async () => {
    userA = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()

    // as in (19) tweet mutation
    // send a graphQL query request as the user

    const text = chance.string({length: 16})
    // Make a graphQL request with the tweet mutation and its text argument
    tweetA = await axiosGraphQLQuery(userA.accessToken, tweet, {text})
    tweetId = tweetA.tweet.id
    userId = userA.username
  })

  it('retweet self: should save the retweet in Tweets an Retweets tables, increment the count in Tweets and Users table, save to timelines table', async () => {
    // create a mock event and feed it to the handler
    const event = generateReTweetEvent(userId, tweetId)
    const context = {}
    await handler(event, context)

    // save the retweet in Tweets
    // increment the count in Tweets table
    const tweetsTableResp = await DynamoDB.get({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetId,
      },
    }).promise()
    expect(tweetsTableResp.Item).toBeTruthy()

    // save the retweet in Retweets table
    const reTweetsTableResp = await DynamoDB.get({
      TableName: process.env.RETWEETS_TABLE,
      Key: {
        userId,
        tweetId,
      },
    }).promise()
    expect(reTweetsTableResp.Item).toBeTruthy()

    // increment the count in Users table
    const usersTableResp = await DynamoDB.get({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userId,
      },
    }).promise()
    expect(usersTableResp.Item).toBeTruthy()
    expect(usersTableResp.Item.tweetsCount).toEqual(2)

    // save to timelines table
    const timelinesTableResp = await DynamoDB.get({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId,
        tweetId,
      },
    }).promise()
    expect(timelinesTableResp.Item).toBeTruthy()

    // doesn't save the retweet in timelines table, if the user is retweeting their own tweet
    const timelinesTableQueryResp = await DynamoDB.query({
      TableName: process.env.TIMELINES_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
    }).promise()
    expect(timelinesTableQueryResp.Items.length).toEqual(1)
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.RETWEETS_TABLE,
      Key: {
        userId,
        tweetId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userId,
        tweetId: tweetId,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userId,
      },
    }).promise()

    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userId,
      })
      .promise()
  })
})
