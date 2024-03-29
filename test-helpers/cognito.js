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
const signUpUser = async () => {
  const {name, email, password} = generateUser()
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.WEB_COGNITO_USER_POOL_CLIENT_ID
  const cognito = new AWS.CognitoIdentityServiceProvider()

  // we sign up and create a user
  const signUpResp = await cognito
    .signUp({
      ClientId: clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        {
          Name: 'name',
          Value: name,
        },
      ],
    })
    .promise()
  const username = signUpResp.UserSub

  // we're not using a real email, we need a way to simulate the verification to confirmUserSignup
  await cognito
    .adminConfirmSignUp({
      UserPoolId: userPoolId,
      Username: username,
    })
    .promise()
  console.log(`[${email}] - confirmed sign up`)

  return {
    username,
    name,
    email,
    password,
    cognito,
    userPoolId,
    clientId,
  }
}

const authorizeUser = async ({
  username,
  password,
  clientId = process.env.WEB_COGNITO_USER_POOL_CLIENT_ID,
}) => {
  const cognito = new AWS.CognitoIdentityServiceProvider()
  return cognito
    .initiateAuth({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    })
    .promise()
}

/**
 * Signs up a user, signs in that user and returns an authenticated user
 * @returns {Object} - {username, name, email, idToken, accessToken}
 */
const signInUser = async () => {
  const {name, email, password, username, cognito, clientId, userPoolId} =
    await signUpUser()

  // authorize the user
  const {
    AuthenticationResult: {IdToken, AccessToken},
  } = await authorizeUser({username, password, clientId})

  return {
    username,
    name,
    email,
    userPoolId,
    cognito,
    idToken: IdToken,
    accessToken: AccessToken,
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
  signUpUser,
  signInUser,
  cleanUpUser,
  authorizeUser,
}
