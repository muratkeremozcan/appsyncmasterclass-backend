require('dotenv').config()
const AWS = require('aws-sdk')
const cognito = new AWS.CognitoIdentityServiceProvider()

const cognitoDeleteUser = (
  Username,
  UserPoolId = process.env.COGNITO_USER_POOL_ID,
) =>
  cognito
    .adminDeleteUser({
      UserPoolId,
      Username,
    })
    .promise()

module.exports = {cognitoDeleteUser}
