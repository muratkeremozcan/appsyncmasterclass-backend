require('dotenv').config()
const AWS = require('aws-sdk')
const DynamoDB = new AWS.DynamoDB.DocumentClient()

const ddbGetUser = username =>
  DynamoDB.get({
    TableName: process.env.USERS_TABLE,
    Key: {
      id: username,
    },
  }).promise()

const ddbDeleteUser = username =>
  DynamoDB.delete({
    TableName: process.env.USERS_TABLE,
    Key: {
      id: username,
    },
  }).promise()

module.exports = {ddbGetUser, ddbDeleteUser}
