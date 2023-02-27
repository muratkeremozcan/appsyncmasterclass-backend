const given = require('../../test-helpers/steps//given')
const when = require('../../test-helpers/steps//when')
const {SearchModes, TweetTypes} = require('../../lib/constants')
const retry = require('async-retry')
const chance = require('chance').Chance()
const AWS = require('aws-sdk')

// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
describe('Given an authenticated user', () => {
  let userAsProfile, tweet, DynamoDB
  let userA

  // if you run into LimitExceeded error, just use a fixed test user on Dev such as appsync-tester2
  // DONT FORGET TO DISABLE THE AFTERALL HOOK
  // const userA = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2YwMmZkNWVhZmQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6IjMyYzViYWUwLWEyZGItNGNkYy1hMTBlLTNiOTBkZWNlNTAzYiIsImV2ZW50X2lkIjoiNTQ3MjJjNzItMzZlZS00MmVhLWI3MGEtMGU0MmNmMWYyNGZlIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzQ5OTg4MSwiZXhwIjoxNjc3NTAzNDgwLCJpYXQiOjE2Nzc0OTk4ODEsImp0aSI6IjAwMDdjMTYwLTIwOTktNDJkZC05YTNhLWM4NzA5YTFkZDkxNyIsInVzZXJuYW1lIjoiNTZlMmZhMmYtOWZkZC00ZTJmLTk3ZWUtYWNmMDJmZDVlYWZkIn0.zIUe2ncH1AXXF2BFkPzXyClEkTv-hEAJ2u7IM70n55_GE27NWyz5vDqnAsOkKowvoSTpP4KebinD-jGJ2bOu4_MHakWdB7fuDws68CIQTMfr0HRDuLFHbuAjVjkElfnlmX_Pt5OlLFtWb4jFJTiECflfXSLJDptfqlA0aHcpWJG0j8IaJkSAJbTwGauO6gXtiiIpGR8gPypcBDAbTX2H1H7F1D11A0gaOUEIShIFqyhe9YvndFaZK3xXz11Zygp9p17uQnwuAmmqnj3NH8ujWD-7JTjgbwu6zSH83nGGO6hpibL23OotlNf52aGhW0UEQgWKZBACMzg2kY5x9AVwXw',
  //   username: '56e2fa2f-9fdd-4e2f-97ee-acf02fd5eafd',
  // }

  beforeAll(async () => {
    userA = await given.an_authenticated_user()
    userAsProfile = await when.a_user_calls_getMyProfile(userA)
    DynamoDB = new AWS.DynamoDB.DocumentClient()
  })

  it('The user can find himself when he searches for his twitter handle', async () => {
    await retry(
      async () => {
        const {results, nextToken} = await when.a_user_calls_search(
          userA,
          SearchModes.PEOPLE,
          userAsProfile.screenName,
          10,
        )

        expect(nextToken).toBeNull()
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
          __typename: 'MyProfile',
          id: userAsProfile.id,
          name: userAsProfile.name,
          screenName: userAsProfile.screenName,
        })
      },
      {
        retries: 5,
        maxTimeout: 5000,
      },
    )
  })

  it('The user can find himself when he searches for his name', async () => {
    await retry(
      async () => {
        const {results} = await when.a_user_calls_search(
          userA,
          SearchModes.PEOPLE,
          userAsProfile.name,
          10,
        )

        expect(results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              __typename: 'MyProfile',
              id: userAsProfile.id,
              name: userAsProfile.name,
              screenName: userAsProfile.screenName,
            }),
          ]),
        )
      },
      {
        retries: 5,
        maxTimeout: 5000,
      },
    )
  })

  describe('When the user sends a tweet', () => {
    const text = chance.string({length: 16})
    beforeAll(async () => {
      tweet = await when.a_user_calls_tweet(userA, text)
    })

    it('The user can find his tweet when he searches for the text', async () => {
      await retry(
        async () => {
          const {results, nextToken} = await when.a_user_calls_search(
            userA,
            SearchModes.LATEST,
            text,
            10,
          )

          expect(nextToken).toBeNull()
          expect(results).toHaveLength(1)
          expect(results[0]).toMatchObject({
            __typename: TweetTypes.TWEET,
            id: tweet.id,
            text,
          })
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })

    describe('When the user replies to the tweet', () => {
      let reply
      const replyText = chance.string({length: 16})
      beforeAll(async () => {
        reply = await when.a_user_calls_reply(userA, tweet.id, replyText)
      })

      it('The user can find his reply when he searches for the reply text', async () => {
        await retry(
          async () => {
            const {results, nextToken} = await when.a_user_calls_search(
              userA,
              SearchModes.LATEST,
              replyText,
              10,
            )

            expect(nextToken).toBeNull()
            expect(results).toHaveLength(1)
            expect(results[0]).toMatchObject({
              __typename: TweetTypes.REPLY,
              id: reply.id,
              text: replyText,
            })
          },
          {
            retries: 5,
            maxTimeout: 5000,
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
        id: userAsProfile.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweet.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userAsProfile.id,
        tweetId: tweet.id,
      },
    }).promise()
    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userAsProfile.id,
      })
      .promise()
  })
})
