const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()

const {TWEETS_TABLE} = process.env

/**
 * Query DDB for a tweet by id
 * @param {string} tweetId
 * @returns {object} tweet
 */
const getTweetById = async tweetId => {
  const resp = await DocumentClient.get({
    TableName: TWEETS_TABLE,
    Key: {
      id: tweetId,
    },
  }).promise()

  return resp.Item
}

module.exports = {
  getTweetById,
}
