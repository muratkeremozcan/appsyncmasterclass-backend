// [7] end-to-end test for confirm-user-signup
// - We create a user from scratch using `AWS.CognitoIdentityServiceProvider` (cognito).
// - We are not using a real email, so we use `cognito.adminConfirmSignup` to simulate the user sign up verification.
// - As a result we should see a DynamoDB table entry, confirm it.
require('dotenv').config()
const {signUpUser} = require('../../test-helpers/helpers')
const AWS = require('aws-sdk')

describe('When a user signs up', () => {
  it("The user's profile should be saved in DynamoDB", async () => {
    // this time we are creating and signing up a user from scratch
    // it will cause a lambda handler trigger
    const {name, username, cognito, userPoolId} = await signUpUser()

    // instead of creating a mock event and feeding it to the handler
    // we did a real sign up, which caused a write to DynamoDB
    // checking DDB is the same as the integration test
    // we need DynamoDB.DocumentClient to read from DynamoDB
    const DynamoDB = new AWS.DynamoDB.DocumentClient()
    console.log(
      `looking for user [${username}] in table [${process.env.USERS_TABLE}]`,
    )
    const resp = await DynamoDB.get({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: username,
      },
    }).promise()
    const ddbUser = resp.Item //?

    // the assertion is exactly the same as before
    expect(ddbUser).toMatchObject({
      id: username,
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
        id: username,
      },
    }).promise()

    // with e2e, we also have to clean up the Cognito user
    await cognito
      .adminDeleteUser({
        UserPoolId: userPoolId,
        Username: username,
      })
      .promise()
  })
})
