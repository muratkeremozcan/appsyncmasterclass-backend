// (51.2) add the lambda function to distribute tweets to followers
const _ = require('lodash')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const Constants = require('../lib/constants')

const {RELATIONSHIPS_TABLE, TIMELINES_TABLE} = process.env

const handler = async event => {
  // iterate through the array of Records, we only care about INSERT and REMOVE
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      // get the tweet object out of the NewImage, insert into follower timelines
      // unmarshall converts the DynamoDB record into a JS object
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
      // find the followers of the tweet creator
      const followers = await getFollowers(tweet.creator)
      // insert tweet into follower timelines
      await distribute(tweet, followers)
    } else if (record.eventName === 'REMOVE') {
      // do the opposite for remove
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)
      const followers = await getFollowers(tweet.creator)
      await undistribute(tweet, followers)
    }
  }
}

/** Uses the global secondary index otherUserId to find the user's followers */
async function getFollowers(userId) {
  const loop = async (acc, exclusiveStartKey) => {
    const resp = await DocumentClient.query({
      TableName: RELATIONSHIPS_TABLE,
      KeyConditionExpression:
        'otherUserId = :otherUserId and begins_with(sk, :follows)',
      ExpressionAttributeValues: {
        ':otherUserId': userId,
        ':follows': 'FOLLOWS_',
      },
      IndexName: 'byOtherUser',
      ExclusiveStartKey: exclusiveStartKey,
    }).promise()

    const userIds = (resp.Items || []).map(x => x.userId)

    if (resp.LastEvaluatedKey) {
      return await loop(acc.concat(userIds), resp.LastEvaluatedKey)
    } else {
      return acc.concat(userIds)
    }
  }

  return await loop([])
}

/** Uses a batch-write to write to tweet to the timelines tables of the followers */
async function distribute(tweet, followers) {
  const timelineEntries = followers.map(userId => ({
    PutRequest: {
      Item: {
        userId,
        tweetId: tweet.id,
        timestamp: tweet.createdAt,
        distributedFrom: tweet.creator,
        retweetOf: tweet.retweetOf,
        inReplyToTweetId: tweet.inReplyToTweetId,
        inReplyToUserIds: tweet.inReplyToUserIds,
      },
    },
  }))

  // https://www.geeksforgeeks.org/lodash-_-chunk-method/
  const chunks = _.chunk(timelineEntries, Constants.DynamoDB.MAX_BATCH_SIZE)

  const promises = chunks.map(async chunk => {
    await DocumentClient.batchWrite({
      RequestItems: {
        [TIMELINES_TABLE]: chunk,
      },
    }).promise()
  })

  await Promise.all(promises)
}

async function undistribute(tweet, followers) {
  const timelineEntries = followers.map(userId => ({
    DeleteRequest: {
      Key: {
        userId,
        tweetId: tweet.id,
      },
    },
  }))

  const chunks = _.chunk(timelineEntries, Constants.DynamoDB.MAX_BATCH_SIZE)

  const promises = chunks.map(async chunk => {
    await DocumentClient.batchWrite({
      RequestItems: {
        [TIMELINES_TABLE]: chunk,
      },
    }).promise()
  })

  await Promise.all(promises)
}

module.exports = {handler}
