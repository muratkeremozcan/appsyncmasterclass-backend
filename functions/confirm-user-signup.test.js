// [4.6] integration test for user-signup
require('dotenv').config()
const handler = require('./confirm-user-signup').handler
const AWS = require('aws-sdk')
const chance = require('chance').Chance()

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

const generateEvent = (userName, name, email) => {
  // got this object from Lumigo
  return {
    version: '1',
    region: process.env.AWS_REGION,
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    userName,
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    request: {
      userAttributes: {
        sub: userName,
        'cognito:email_alias': email,
        'cognito:user_status': 'CONFIRMED',
        email_verified: 'false',
        name,
        email,
      },
    },
    response: {},
  }
}

describe('When confirmUserSignup runs', () => {
  it("The user's profile should be saved in DynamoDB", async () => {
    const {name, email} = generateUser()
    const userName = chance.guid()
    const context = {}
    const event = generateEvent(userName, name, email)
    name //?
    // create an event and feed it to the handler
    await handler(event, context)

    // the handler creates a write to DynamoDB
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
  })
})
