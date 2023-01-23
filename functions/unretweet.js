// (39.3) Implement the unretweet function.
// Delete the tweet from the TweetsTable, the RetweetsTable, and the TimelinesTable if it's not the same user
// Decrement the count on the UsersTable and the TweetsTable
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const _ = require('lodash')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE, RETWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument unretweet - unretweet(tweetId: ID!): Boolean!
  // we can extract that from event.arguments
  const {tweetId} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity

  // get from Tweets
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

  // At (35.3) retweet, we created the new tweet (type Retweet implements ITweet)
  // In contrast, now we have to query DDB for the retweet so that we can delete it
  const queryResp = await DocumentClient.query({
    TableName: TWEETS_TABLE,
    IndexName: 'retweetsByCreator',
    KeyConditionExpression: 'creator = :creator AND retweetOf = :tweetId',
    ExpressionAttributeValues: {
      ':creator': username,
      ':tweetId': tweetId,
    },
    Limit: 1,
  }).promise()

  const retweet = _.get(queryResp, 'Items.0')

  if (!retweet) throw new Error('Retweet is not found')

  // Delete the tweet from the TweetsTable, the RetweetsTable, and the TimelinesTable if it's not the same user
  // Decrement the count on the UsersTable and the TweetsTable

  const transactItems = [
    {
      Delete: {
        TableName: TWEETS_TABLE,
        Key: {
          id: retweet.id,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Delete: {
        TableName: RETWEETS_TABLE,
        Key: {
          userId: username,
          tweetId,
        },
        ConditionExpression: 'attribute_exists(tweetId)',
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD retweets :minusOne',
        ExpressionAttributeValues: {
          ':minusOne': -1,
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
        UpdateExpression: 'ADD tweetsCount :minusOne',
        ExpressionAttributeValues: {
          ':minusOne': -1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
  ]

  console.log(`creator: [${tweet.creator}]; username: [${username}]`)
  // if it's not the same user, delete the retweet from Timelines
  if (tweet.creator !== username) {
    transactItems.push({
      Delete: {
        TableName: TIMELINES_TABLE,
        Key: {
          userId: username,
          tweetId: retweet.id,
        },
      },
    })
  }

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return true
}

module.exports = {
  handler,
}
