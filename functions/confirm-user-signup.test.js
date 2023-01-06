const handler = require('./confirm-user-signup').handler
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

const generateEvent = (username, name, email) => {
  // got this object from Lumigo
  return {
    version: '1',
    region: process.env.AWS_REGION,
    userPoolId: process.env.USER_POOL_ID,
    username,
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    request: {
      userAttributes: {
        sub: username,
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
    const username = chance.guid()
    const context = {}
    const event = generateEvent(username, name, email) //?
    // await handler (event, context)
  })
})
