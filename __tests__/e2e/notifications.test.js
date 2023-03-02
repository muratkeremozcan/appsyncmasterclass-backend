// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
// the notification array is empty no matter what
global.WebSocket = require('ws')
const given = require('../../test-helpers/steps/given')
const when = require('../../test-helpers/steps/when')
const gql = require('graphql-tag')
const retry = require('async-retry')
const chance = require('chance').Chance()
const {AWSAppSyncClient, AUTH_TYPE} = require('aws-appsync')
require('isomorphic-fetch')
const AWS = require('aws-sdk')
console.warn = jest.fn()
console.error = jest.fn()

// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
// the notification array is empty no matter what
describe.skip('Given two authenticated users', () => {
  let userAsProfile, userAsTweet, DynamoDB
  const text = chance.string({length: 16})
  let userA, userB
  // if you run into LimitExceeded error, just use a fixed test user on Dev such as appsync-tester2
  // DONT FORGET TO DISABLE THE AFTERALL HOOK
  // const userA = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2YwMmZkNWVhZmQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6Ijk3ZDZkNzQ4LTY2ZTctNGYzZS04ZjQzLWZhYzA0ZjM3YjIxNCIsImV2ZW50X2lkIjoiMmY1Njc4ODYtZDQ3Mi00Mzc2LThhNGMtNmFjYjI3MmYyOTc1IiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzU5MDQ0MCwiZXhwIjoxNjc3NTk0MDQwLCJpYXQiOjE2Nzc1OTA0NDAsImp0aSI6IjFhOWZjOGZiLTZiZWYtNDM0MS1iZWVjLWU0ZGUzMWIxNDBlMiIsInVzZXJuYW1lIjoiNTZlMmZhMmYtOWZkZC00ZTJmLTk3ZWUtYWNmMDJmZDVlYWZkIn0.dI2ggK4ilz_l2gqoDAbm12Sn1yxhGn28zamnXJXFKm54nfcF2onuoAZNuN_Zf6ExMTgFpX2YTkNSXu_-77FKhGMOXnkxnC_hezibfvYI2Mr5ABOkzfI0NJLWeTwdv6-fnzqHeA59FVYMh_BL19u3YjUEX7agSxGtCbe3BO-cWsGRagbGZyL5W5M1q1GB43ICHammyDSOcIq0e7_AwPzqePg06XG6AANsh_owLJULxX6x2n2jdbiJi1F8162s0p_hYMrv4Dtjsqn22aAy1FTPdIPO30Lr2jbsnA4v1Yjjuc4QWfJsSkAin4pQi4j1rrD7Co2bWx6hPJkH1bZZbdhTMg',
  //   username: '56e2fa2f-9fdd-4e2f-97ee-acf02fd5eafd',
  // }
  // const userB = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiJhOTI0NGM3My0xN2QwLTQ3ZGUtYjY0OC1kYjBiNTM5NTU0NjEiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6IjAxYmQ0NDFlLTczOWQtNDMxYy1iYjNiLTVmOTEzZjI1NzIxYSIsImV2ZW50X2lkIjoiOTM1OWIyMjItYjM4YS00YjcxLWFjZTAtMmEyYzM3NTg5YWRlIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzU5MDQ3OSwiZXhwIjoxNjc3NTk0MDc5LCJpYXQiOjE2Nzc1OTA0NzksImp0aSI6ImEyYzg5OTlkLTAzNjgtNDFiNC1hODIwLTc3MTE4YzBjYmEyNSIsInVzZXJuYW1lIjoiYTkyNDRjNzMtMTdkMC00N2RlLWI2NDgtZGIwYjUzOTU1NDYxIn0.s4GeRI2Q-2V4IK39TFzO0HtrzY4arCx8hrUvGO5xS6BznNzcyqTK4hRwNEjnt2VZxPdKy8q8JyfWRvpZM_XhGezqK_hYQzmFfNnZ2g9JF3_t9tZtd0EnVQDhKMlHGrL1B7I5Dqvg1MH6IkztDpYjNUd9f3418CIW_k_ioMRojnqD1K0ZPqZw57WvmyfXCggulcbIPF2VXfI8J3fiEVy_hKaPPJnjGkJNUhWoK7nbRvEGGzSfour4SIjZv_ZqAIC6xeeyNyVrrpxLigzIgAefiXZWXPOksyGd_UFidm5P4mrGi3abpyErqNZ5ogJ8RNrQCM-y3xsDjf19DfaXiiTYvA',
  //   username: 'a9244c73-17d0-47de-b648-db0b53955461',
  // }
  beforeAll(async () => {
    userA = await given.an_authenticated_user()
    userB = await given.an_authenticated_user()
    userAsProfile = await when.a_user_calls_getMyProfile(userA)
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

                ... on Liked {
                  tweetId
                  likedBy
                }

                ... on Replied {
                  tweetId
                  replyTweetId
                  repliedBy
                }

                ... on Mentioned {
                  mentionedByTweetId
                  mentionedBy
                }

                ... on DMed {
                  otherUserId
                  message
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

    describe("When user B likes user A's tweet", () => {
      beforeAll(async () => {
        await when.a_user_calls_like(userB, userAsTweet.id)
      })

      it('User A should receive a notification', async () => {
        await retry(
          async () => {
            expect(notifications).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'Liked',
                  userId: userA.username,
                  tweetId: userAsTweet.id,
                  likedBy: userB.username,
                }),
              ]),
            )
          },
          {
            retries: 10,
            maxTimeout: 1000,
          },
        )
      }, 15000)
    })

    describe("When user B retweets user A's tweet", () => {
      let userBsRetweet
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
            maxTimeout: 1000,
          },
        )
      }, 15000)
    })

    describe("When user B replied to user A's tweet", () => {
      let userBsReply
      const replyText = chance.string({length: 16})
      beforeAll(async () => {
        userBsReply = await when.a_user_calls_reply(
          userB,
          userAsTweet.id,
          replyText,
        )
      })

      it('User A should receive a notification', async () => {
        await retry(
          async () => {
            expect(notifications).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'Replied',
                  userId: userA.username,
                  tweetId: userAsTweet.id,
                  repliedBy: userB.username,
                  replyTweetId: userBsReply.id,
                }),
              ]),
            )
          },
          {
            retries: 10,
            maxTimeout: 1000,
          },
        )
      }, 15000)
    })

    describe('When user B mentions user A in a tweet', () => {
      let userBsTweet

      beforeAll(async () => {
        const text = `hey @${userAsProfile.screenName}`
        userBsTweet = await when.a_user_calls_tweet(userB, text)
      })

      it('User A should receive a notification', async () => {
        await retry(
          async () => {
            expect(notifications).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'Mentioned',
                  userId: userA.username,
                  mentionedByTweetId: userBsTweet.id,
                  mentionedBy: userB.username,
                }),
              ]),
            )
          },
          {
            retries: 10,
            maxTimeout: 1000,
          },
        )
      }, 15000)
    })

    describe('When user B DMs user A', () => {
      const message = chance.string({length: 16})

      beforeAll(async () => {
        await when.a_user_calls_sendDirectMessage(
          userB,
          userA.username,
          message,
        )
      })

      it('User A should receive a notification', async () => {
        await retry(
          async () => {
            expect(notifications).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  userId: userA.username,
                  type: 'DMed',
                  otherUserId: userB.username,
                  message,
                }),
              ]),
            )
          },
          {
            retries: 10,
            maxTimeout: 1000,
          },
        )
      }, 15000)
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
