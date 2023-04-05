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

module.exports = {ddbGetUser, ddbDeleteUser}
