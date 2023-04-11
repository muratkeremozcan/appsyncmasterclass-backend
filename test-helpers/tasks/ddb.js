require('dotenv').config()
const AWS = require('aws-sdk')
const DynamoDB = new AWS.DynamoDB.DocumentClient()

const ddbGetUser = (username, TableName = process.env.USERS_TABLE) =>
  DynamoDB.get({
    TableName,
    Key: {
      id: username,
    },
  }).promise()

const ddbDeleteUser = (username, TableName = process.env.USERS_TABLE) =>
  DynamoDB.delete({
    TableName,
    Key: {
      id: username,
    },
  }).promise()

const ddbDeleteTweet = (tweetId, tweetsTable = process.env.TWEETS_TABLE) =>
  DynamoDB.delete({
    TableName: tweetsTable,
    Key: {
      id: tweetId,
    },
  }).promise()

const ddbDeleteTweetAndTimeline = async (
  tweetId,
  userId,
  tweetsTable = process.env.TWEETS_TABLE,
  timelinesTable = process.env.TIMELINES_TABLE,
) => {
  await ddbDeleteTweet(tweetId, tweetsTable)

  return await DynamoDB.delete({
    TableName: timelinesTable,
    Key: {
      userId,
      tweetId,
    },
  }).promise()
}

module.exports = {
  ddbGetUser,
  ddbDeleteUser,
  ddbDeleteTweet,
  ddbDeleteTweetAndTimeline,
}
