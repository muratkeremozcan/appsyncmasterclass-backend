// (35.4) add the lambda function that will
// Get from Tweets, write to Tweets, Timelines, Retweets, Update Tweets and Users
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE, RETWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument retweet - retweet(tweetId: ID!): Boolean!
  // we can extract that from event.arguments
  const {tweetId} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()

  // get from Tweets (we can use a helper)
  const getTweetResp = await DocumentClient.get({
    TableName: TWEETS_TABLE,
    Key: {
      id: tweetId,
    },
  }).promise()

  const tweet = getTweetResp.Item
  if (!tweet) {
    throw new Error('Tweet is not found')
  }

  /* from the schema:
  type Retweet implements ITweet {
    id: ID!
    profile: IProfile!
    createdAt: AWSDateTime!
    retweetOf: ITweet!
  }
  */
  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.RETWEET,
    id,
    creator: username,
    createdAt: timestamp,
    retweetOf: tweetId,
  }

  // write to Tweets, Retweets (only write to Timelines if it's not the same user)
  // update Tweets, Users

  const transactItems = [
    {
      Put: {
        TableName: TWEETS_TABLE,
        Item: newTweet,
      },
    },
    {
      Put: {
        TableName: RETWEETS_TABLE,
        Item: {
          userId: username,
          tweetId,
          createdAt: timestamp,
        },
        ConditionExpression: 'attribute_not_exists(tweetId)',
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD retweets :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: {
          id: username,
        },
        UpdateExpression: 'ADD tweetsCount :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
  ]

  console.log(`creator: [${tweet.creator}]; username: [${username}]`)
  // if it's not the same user, write to Timelines
  if (tweet.creator !== username) {
    transactItems.push({
      Put: {
        TableName: TIMELINES_TABLE,
        Item: {
          userId: username,
          tweetId: id,
          retweetOf: tweetId,
          timestamp,
        },
      },
    })
  }

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return newTweet
}

module.exports = {
  handler,
}
