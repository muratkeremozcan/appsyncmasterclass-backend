const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const Chance = require('chance')
const chance = new Chance()

const {USERS_TABLE} = process.env

// (4.5) implement the lambda function for confirming a user signup
const handler = async event => {
  if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
    const name = event.request.userAttributes['name']

    const suffix = chance.string({
      length: 8,
      casing: 'upper',
      alpha: true,
      numeric: true,
    })

    const screenName = `${name.replace(/[^a-zA-Z0-9]/g, '')}${suffix}`

    const user = {
      id: event.userName, // per the shape of the data, userName is camelCase
      name,
      screenName,
      createdAt: new Date().toJSON(),
      followersCount: 0,
      followingCount: 0,
      tweetsCount: 0,
      likesCounts: 0,
    }

    await DocumentClient.put({
      TableName: USERS_TABLE,
      Item: user,
      ConditionExpression: 'attribute_not_exists(id)', // making sure we don't write the same user twice
    }).promise()

    return event
  } else {
    return event
  }
}

module.exports = {
  handler,
}
