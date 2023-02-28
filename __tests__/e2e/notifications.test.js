global.WebSocket = require('ws')
const given = require('../../test-helpers/steps/given')
const when = require('../../test-helpers/steps/when')
const gql = require('graphql-tag')
const retry = require('async-retry')
const chance = require('chance').Chance()
const {AWSAppSyncClient, AUTH_TYPE} = require('aws-appsync')
require('isomorphic-fetch')
console.error = jest.fn()
const AWS = require('aws-sdk')

// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
// the notification array is empty no matter what
describe.skip('Given two authenticated users', () => {
  let userAsTweet, userBsRetweet, DynamoDB
  let userA, userB
  const text = chance.string({length: 16})

  // if you run into LimitExceeded error, just use a fixed test user on Dev such as appsync-tester2
  // DONT FORGET TO DISABLE THE AFTERALL HOOK
  // const userA = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2YwMmZkNWVhZmQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6IjZkYzBmMmIxLWUyM2YtNGQ2YS1hNWM1LTIwMWNiN2FiYjAxMSIsImV2ZW50X2lkIjoiYjdjYWE1Y2EtMDQzOC00Y2E2LTg1YmUtOWUwMWM1NmQ0NzAxIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzUwNTcxMSwiZXhwIjoxNjc3NTA5MzExLCJpYXQiOjE2Nzc1MDU3MTEsImp0aSI6IjBjYTU1NzdkLTBhZDAtNDMxOC05NTM5LTA0OTY5YWQxNzdkOCIsInVzZXJuYW1lIjoiNTZlMmZhMmYtOWZkZC00ZTJmLTk3ZWUtYWNmMDJmZDVlYWZkIn0.PGVCsmDPdCq3kEESjP4pSNyxPDNirxvjHz096Ogk_N29cDP2f6lQtF90H1sH48sFkf1KrVWoVX8FdP99x5iXbK8PrA8Zj7n0p0B9q3dmAij_ERVvirKNr6ww_pCPxmKvBmdZ1CgxzjHLWl8dQNoxbyeC57Kxe0PoiTYmROTT5oD25RqkyWH70x2dz4_xKTb68dgecfbNGH5WjbdIO4QHc-4A8H7PQW7Ysb_PYxmePCy7xssrqnphpe1WkjRYlWw4AoYh7B6__FHSIWRnazv8LljeOLVZ0hrOZ74FiwFb9v5Xtm-3YNpttnFpbRHg4VpothRyTDI0GWd5ZkLJg_rTAQ',
  //   username: '56e2fa2f-9fdd-4e2f-97ee-acf02fd5eafd',
  // }
  // create a userB with appsync-tester3
  // const userB = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2YwMmZkNWVhZmQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6IjZkYzBmMmIxLWUyM2YtNGQ2YS1hNWM1LTIwMWNiN2FiYjAxMSIsImV2ZW50X2lkIjoiYjdjYWE1Y2EtMDQzOC00Y2E2LTg1YmUtOWUwMWM1NmQ0NzAxIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzUwNTcxMSwiZXhwIjoxNjc3NTA5MzExLCJpYXQiOjE2Nzc1MDU3MTEsImp0aSI6IjBjYTU1NzdkLTBhZDAtNDMxOC05NTM5LTA0OTY5YWQxNzdkOCIsInVzZXJuYW1lIjoiNTZlMmZhMmYtOWZkZC00ZTJmLTk3ZWUtYWNmMDJmZDVlYWZkIn0.PGVCsmDPdCq3kEESjP4pSNyxPDNirxvjHz096Ogk_N29cDP2f6lQtF90H1sH48sFkf1KrVWoVX8FdP99x5iXbK8PrA8Zj7n0p0B9q3dmAij_ERVvirKNr6ww_pCPxmKvBmdZ1CgxzjHLWl8dQNoxbyeC57Kxe0PoiTYmROTT5oD25RqkyWH70x2dz4_xKTb68dgecfbNGH5WjbdIO4QHc-4A8H7PQW7Ysb_PYxmePCy7xssrqnphpe1WkjRYlWw4AoYh7B6__FHSIWRnazv8LljeOLVZ0hrOZ74FiwFb9v5Xtm-3YNpttnFpbRHg4VpothRyTDI0GWd5ZkLJg_rTAQ',
  //   username: '56e2fa2f-9fdd-4e2f-97ee-acf02fd5eafd',
  // }

  beforeAll(async () => {
    userA = await given.an_authenticated_user()
    userB = await given.an_authenticated_user()
    userAsTweet = await when.a_user_calls_tweet(userA, text)
    DynamoDB = new AWS.DynamoDB.DocumentClient()
  })

  describe('Given user A subscribes to notifications', () => {
    let client, subscription
    const notifications = []

    beforeAll(async () => {
      client = new AWSAppSyncClient({
        url: process.env.API_URL,
        region: process.env.AWS_REGION,
        auth: {
          type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
          jwtToken: () => userA.idToken,
        },
        disableOffline: true,
      })

      subscription = client
        .subscribe({
          query: gql`
            subscription onNotified($userId: ID!) {
              onNotified(userId: $userId) {
                ... on iNotification {
                  id
                  type
                  userId
                  createdAt
                }

                ... on Retweeted {
                  tweetId
                  retweetedBy
                  retweetId
                }
              }
            }
          `,
          variables: {
            userId: userA.username,
          },
        })
        .subscribe({
          next: resp => {
            notifications.push(resp.data.onNotified)
          },
        })
    })

    afterAll(() => {
      subscription.unsubscribe()
    })

    describe("When user B retweets user A's tweet", () => {
      beforeAll(async () => {
        userBsRetweet = await when.a_user_calls_retweet(userB, userAsTweet.id)
      })

      it('User A should receive a notification', async () => {
        await retry(
          async () => {
            expect(notifications).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'Retweeted',
                  userId: userA.username,
                  tweetId: userAsTweet.id,
                  retweetId: userBsRetweet.id,
                  retweetedBy: userB.username,
                }),
              ]),
            )
          },
          {
            retries: 10,
            maxTimeout: 3000,
          },
        )
      })
    })
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userA.username,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: userAsTweet.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userA.username,
        tweetId: userAsTweet.id,
      },
    }).promise()
    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userA.username,
      })
      .promise()

    // useB clean up
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userB.username,
      },
    }).promise()
    await userB.cognito
      .adminDeleteUser({
        UserPoolId: userB.userPoolId,
        Username: userB.username,
      })
      .promise()
  })
})
