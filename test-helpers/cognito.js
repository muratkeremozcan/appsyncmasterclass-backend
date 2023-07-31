require('dotenv').config()
const AWS = require('aws-sdk')
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} = require('@aws-sdk/client-cognito-identity-provider')
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

// /**
//  * Signs up a user, signs in that user and returns an authenticated user
//  * @returns {Object} - {username, name, email, idToken, accessToken}
//  */
// const signInUser = async () => {
//   const {name, email, password, username, cognito, clientId, userPoolId} =
//     await signUpUser()

//   // authorize the user
//   const {
//     AuthenticationResult: {IdToken, AccessToken},
//   } = await authorizeUser({username, password, clientId})

//   return {
//     username,
//     name,
//     email,
//     userPoolId,
//     cognito,
//     idToken: IdToken,
//     accessToken: AccessToken,
//   }
// }

// needs number, special char, upper and lower case
const random_password = () => `${chance.string({length: 8})}B!gM0uth`

/**
 * Creates an authenticated user.
 *
 * @async
 * @returns {Promise<Object>} A promise that resolves to an object containing user details:
 *    - username: a string containing the username of the newly created user.
 *    - firstName: a string containing the first name of the newly created user.
 *    - lastName: a string containing the last name of the newly created user.
 *    - idToken: a string containing the ID token for the newly authenticated user.
 * @throws {Error} Throws an error if there is a problem creating the user or authenticating.
 */
const signInUser = async () => {
  // @ts-expect-error - If you are running this in an AWS environment (like Lambda, EC2, ECS), the SDK will automatically load the argument
  // an object with AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.
  const cognito = new CognitoIdentityProviderClient()

  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.WEB_COGNITO_USER_POOL_CLIENT_ID

  const firstName = chance.first({nationality: 'en'})
  const lastName = chance.last({nationality: 'en'})
  const suffix = chance.string({length: 8, pool: 'abcdefghijklmnopqrstuvwxyz'})
  const username = `test-${firstName}-${lastName}-${suffix}`
  const password = random_password()
  const email = `${firstName}-${lastName}@big-mouth.com`
  const name = `${firstName} ${lastName} ${suffix}`

  const createReq = new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: username,
    MessageAction: 'SUPPRESS',
    TemporaryPassword: password,
    UserAttributes: [
      {Name: 'given_name', Value: firstName},
      {Name: 'family_name', Value: lastName},
      {Name: 'email', Value: email},
    ],
  })
  await cognito.send(createReq)

  console.log(`[${username}] - user is created`)

  const req = new AdminInitiateAuthCommand({
    AuthFlow: 'ADMIN_NO_SRP_AUTH',
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  })
  const resp = await cognito.send(req)

  console.log(`[${username}] - initialised auth flow`)

  const challengeReq = new AdminRespondToAuthChallengeCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    ChallengeName: resp.ChallengeName,
    Session: resp.Session,
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: random_password(),
    },
  })
  const challengeResp = await cognito.send(challengeReq)

  console.log(`[${username}] - responded to auth challenge`)

  return {
    username,
    name,
    email,
    userPoolId,
    cognito,
    idToken: challengeResp.AuthenticationResult.IdToken,
    accessToken: challengeResp.AuthenticationResult.AccessToken,
    firstName,
    lastName,
    clientId,
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
