// [4.7] end-to-end test for user-signup
require('dotenv').config()
const {generateUser} = require('../__tests__/helpers')
const AWS = require('aws-sdk')

describe('When a user signs up', () => {
  it("The user's profile should be saved in DynamoDB", async () => {
    const {name, email, password} = generateUser()

    // this time we are creating a user id from scratch
    // it will cause a lambda handler trigger
    const cognito = new AWS.CognitoIdentityServiceProvider()
    const userPoolId = process.env.COGNITO_USER_POOL_ID
    const clientId = process.env.WEB_COGNITO_USER_POOL_CLIENT_ID

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
    const userName = signUpResp.UserSub

    // we're not using a real email, we need a way to simulate the verification to confirmUserSignup
    await cognito
      .adminConfirmSignUp({
        UserPoolId: userPoolId,
        Username: userName,
      })
      .promise()
    console.log(`[${email}] - confirmed sign up`)

    // instead of creating a mock event and feeding it to the handler
    // we did a real sign up, which caused a write to DynamoDB
    // checking DDB is the same as the integration test
    // we need DynamoDB.DocumentClient to read from DynamoDB
    const DynamoDB = new AWS.DynamoDB.DocumentClient()
    console.log(
      `looking for user [${userName}] in table [${process.env.USERS_TABLE}]`,
    )
    const resp = await DynamoDB.get({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userName,
      },
    }).promise()
    const ddbUser = resp.Item //?

    // the assertion is exactly the same as before
    expect(ddbUser).toMatchObject({
      id: userName,
      name,
      createdAt: expect.stringMatching(
        /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?Z?/g,
      ),
      followersCount: 0,
      followingCount: 0,
      tweetsCount: 0,
      likesCounts: 0,
    })
    const [firstName, lastName] = name.split(' ')
    expect(ddbUser.screenName).toContain(firstName)
    expect(ddbUser.screenName).toContain(lastName)

    // clean up the DDB user
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userName,
      },
    }).promise()

    await cognito
      .adminDeleteUser({
        UserPoolId: userPoolId,
        Username: userName,
      })
      .promise()
  })
})
