// (17.2.2) add the lambda function that will generate a tweet ulid for the 3 DDB tables,
// write to Tweets and Timelines tables, and update Users table
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')
const {extractHashTags} = require('../lib/tweets')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument text - tweet(text: String!): Tweet!
  // we can extract that from event.arguments
  const {text} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()
  const hashTags = extractHashTags(text)

  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.TWEET,
    id,
    text,
    creator: username,
    createdAt: timestamp,
    replies: 0,
    likes: 0,
    retweets: 0,
    hashTags,
  }

  // we need 3 operations; 2 writes to Tweets and Timelines tables, and and update to Users table
  await DocumentClient.transactWrite({
    TransactItems: [
      {
        Put: {
          TableName: TWEETS_TABLE,
          Item: newTweet,
        },
      },
      {
        Put: {
          TableName: TIMELINES_TABLE,
          Item: {
            userId: username,
            tweetId: id,
            timestamp,
          },
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
          // do not update if the user does not exist
          ConditionExpression: 'attribute_exists(id)',
        },
      },
    ],
  }).promise()

  return newTweet
}

module.exports = {
  handler,
}
