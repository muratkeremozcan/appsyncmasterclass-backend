require('dotenv').config()
const AWS = require('aws-sdk')
const cognito = new AWS.CognitoIdentityServiceProvider()

const cognitoDeleteUser = username =>
  cognito
    .adminDeleteUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username,
    })
    .promise()

module.exports = {cognitoDeleteUser}
