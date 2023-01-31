// (54.2) Add the lambda function
// Find the tweets for the user being followed.
// Insert the recent n tweets to user's follower's timeline.
// Remove the tweets on unfollow

const _ = require('lodash')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const Constants = require('../lib/constants')

const {TWEETS_TABLE, TIMELINES_TABLE, MAX_TWEETS} = process.env
const MaxTweets = parseInt(MAX_TWEETS)

module.exports.handler = async event => {
  // iterate through the array of Records, we only care about INSERT and REMOVE
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      // get the relationship object out of the NewImage
      // unmarshall converts the DynamoDB record into a JS object
      const relationship = DynamoDB.Converter.unmarshall(
        record.dynamodb.NewImage,
      )

      const [relType] = relationship.sk.split('_')
      if (relType === 'FOLLOWS') {
        // get the tweet object out of the NewImage, insert into follower timeline
        const tweets = await getTweets(relationship.otherUserId)
        await distribute(tweets, relationship.userId)
      }
    } else if (record.eventName === 'REMOVE') {
      // do the opposite for remove
      const relationship = DynamoDB.Converter.unmarshall(
        record.dynamodb.OldImage,
      )

      const [relType] = relationship.sk.split('_')
      if (relType === 'FOLLOWS') {
        const tweets = await getTimelineEntriesBy(
          relationship.otherUserId,
          relationship.userId,
        )
        await undistribute(tweets, relationship.userId)
      }
    }
  }
}

async function getTweets(userId) {
  const loop = async (acc, exclusiveStartKey) => {
    const resp = await DocumentClient.query({
      TableName: TWEETS_TABLE,
      KeyConditionExpression: 'creator = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      IndexName: 'byCreator',
      ExclusiveStartKey: exclusiveStartKey,
    }).promise()

    const tweets = resp.Items || []
    const newAcc = acc.concat(tweets)

    if (resp.LastEvaluatedKey && newAcc.length < MaxTweets) {
      return await loop(newAcc, resp.LastEvaluatedKey)
    } else {
      return newAcc
    }
  }

  return await loop([])
}

async function getTimelineEntriesBy(distributedFrom, userId) {
  const loop = async (acc, exclusiveStartKey) => {
    const resp = await DocumentClient.query({
      TableName: TIMELINES_TABLE,
      KeyConditionExpression:
        'userId = :userId AND distributedFrom = :distributedFrom',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':distributedFrom': distributedFrom,
      },
      IndexName: 'byDistributedFrom',
      ExclusiveStartKey: exclusiveStartKey,
    }).promise()

    const tweets = resp.Items || []
    const newAcc = acc.concat(tweets)

    if (resp.LastEvaluatedKey) {
      return await loop(newAcc, resp.LastEvaluatedKey)
    } else {
      return newAcc
    }
  }

  return await loop([])
}

async function distribute(tweets, userId) {
  const timelineEntries = tweets.map(tweet => ({
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

async function undistribute(tweets, userId) {
  const timelineEntries = tweets.map(tweet => ({
    DeleteRequest: {
      Key: {
        userId,
        tweetId: tweet.tweetId,
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
