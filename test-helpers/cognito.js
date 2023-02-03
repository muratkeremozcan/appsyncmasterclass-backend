require('dotenv').config()
const AWS = require('aws-sdk')
const chance = require('chance').Chance()

/**
 * Generates a random user with name, email and password
 * @returns {Object} - {name, email, password}
 */
const generateUser = () => {
  const firstName = chance.first({nationality: 'en'})
  const lastName = chance.last({nationality: 'en'})
  const suffix = chance.string({length: 4, pool: 'abcdefghijklmnopqrstuvwxyz'})

  const name = `${firstName} ${lastName} ${suffix}`
  const password = chance.string({length: 8})
  const email = `${firstName}-${lastName}-${suffix}@appsyncmasterclass.com`

  return {
    name,
    password,
    email,
  }
}

/**
 * Generates a random user with name, email and password and signs up the user.
 * It also returns the cognito instance, userPoolId, clientId
 * @returns {Object} - {name, email, password, username, cognito}
 */
const signInUser = async () => {
  const {name, email, password} = generateUser()
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.WEB_COGNITO_USER_POOL_CLIENT_ID
  const cognito = new AWS.CognitoIdentityServiceProvider()

  // we create a user as admin and set a password (no temporary passwords!)
  const createUserResp = await cognito
    .adminCreateUser({
      UserPoolId: userPoolId,
      Username: email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        {
          Name: 'name',
          Value: name,
        },
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'email_verified',
          Value: 'true',
        },
      ],
      ClientMetadata: {
        ClientId: clientId,
      },
      TemporaryPassword: 'Password-1Password-1',
    })
    .promise()

  const username = createUserResp.User.Username

  console.log(`[${email}] - confirmed sign up`)
  console.log(`[${password}] - with password`)

  const signinResult = await cognito
    .initiateAuth({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: 'Password-1Password-1',
      },
    })
    .promise()

  // Now need to ensure that new password is set in order that user status is set to CONFIRMED.
  // respond to auth challenge (this is needed with adminCreateUser approach)
  const challengeResp = await cognito
    .adminRespondToAuthChallenge({
      ClientId: clientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: signinResult.Session,
      UserPoolId: userPoolId,
      ChallengeResponses: {
        USERNAME: username,
        NEW_PASSWORD: password,
      },
    })
    .promise()

  console.log(`Id token: ${challengeResp.AuthenticationResult.IdToken}`)
  console.log(`Access token: ${challengeResp.AuthenticationResult.AccessToken}`)

  return {
    username,
    name,
    email,
    password,
    cognito,
    userPoolId,
    clientId,
    idToken: challengeResp.AuthenticationResult.IdToken,
    accessToken: challengeResp.AuthenticationResult.AccessToken,
  }
}

const cleanUpUser = async (username, cognito, userPoolId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient()
  await DynamoDB.delete({
    TableName: process.env.USERS_TABLE,
    Key: {
      id: username,
    },
  }).promise()

  await cognito
    .adminDeleteUser({
      UserPoolId: userPoolId,
      Username: username,
    })
    .promise()
}

module.exports = {
  generateUser,
  signInUser,
  cleanUpUser,
}
