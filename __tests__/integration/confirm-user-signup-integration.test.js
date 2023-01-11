// [4.6] integration test for user-signup
require('dotenv').config()
const handler = require('../../functions/confirm-user-signup').handler
const {
  generateUser,
  generateSignUpEvent,
} = require('../../test-helpers/helpers')
const AWS = require('aws-sdk')
const chance = require('chance').Chance()

describe('When confirmUserSignup runs', () => {
  it("The user's profile should be saved in DynamoDB", async () => {
    const {name, email} = generateUser()

    // create a mock event and feed it to the handler
    const username = chance.guid()
    const event = generateSignUpEvent(username, name, email)
    const context = {}
    await handler(event, context)

    // the handler creates a write to DynamoDB
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
  })
})
