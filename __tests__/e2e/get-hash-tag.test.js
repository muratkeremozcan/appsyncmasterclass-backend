const given = require('../../test-helpers/steps/given')
const when = require('../../test-helpers/steps/when')
const {HashTagModes, TweetTypes} = require('../../lib/constants')
const retry = require('async-retry')
const chance = require('chance').Chance()
const AWS = require('aws-sdk')

// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
describe.skip('Given an authenticated user', () => {
  let userA, userAsProfile, tweet, DynamoDB
  const hashTag = `#${chance.string({length: 16, alpha: true})}`

  beforeAll(async () => {
    userA = await given.an_authenticated_user()
    userAsProfile = await when.a_user_calls_getMyProfile(userA)
    await when.a_user_calls_editMyProfile(userA, {
      name: userAsProfile.name,
      imageUrl: userAsProfile.imageUrl,
      backgroundImageUrl: userAsProfile.backgroundImageUrl,
      bio: `my bio has a hashtag: ${hashTag}`,
      location: userAsProfile.location,
      website: userAsProfile.website,
      birthdate: userAsProfile.birthdate,
    })
    DynamoDB = new AWS.DynamoDB.DocumentClient()
  })

  describe('GetHashTag', () => {
    it('The user can find himself when he gets the hash tag with PEOPLE', async () => {
      await retry(
        async () => {
          const {results, nextToken} = await when.a_user_calls_getHashTag(
            userA,
            HashTagModes.PEOPLE,
            hashTag,
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
          maxTimeout: 1000,
        },
      )
    })

    describe('When the user sends a tweet', () => {
      const text = chance.string({length: 16}) + ' ' + hashTag
      beforeAll(async () => {
        tweet = await when.a_user_calls_tweet(userA, text)
      })

      it('The user can find his tweet when he gets the hash tag with LATEST', async () => {
        await retry(
          async () => {
            const {results, nextToken} = await when.a_user_calls_getHashTag(
              userA,
              HashTagModes.LATEST,
              hashTag,
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
            maxTimeout: 1000,
          },
        )
      })

      describe('When the user replies to the tweet', () => {
        let reply
        const replyText = chance.string({length: 16}) + ' ' + hashTag
        beforeAll(async () => {
          reply = await when.a_user_calls_reply(userA, tweet.id, replyText)
        })

        it('The user can find his reply when he gets the hash tag with LATEST', async () => {
          await retry(
            async () => {
              const {results, nextToken} = await when.a_user_calls_getHashTag(
                userA,
                HashTagModes.LATEST,
                hashTag,
                10,
              )

              expect(nextToken).toBeNull()
              expect(results).toHaveLength(2)
              expect(results[0]).toMatchObject({
                __typename: TweetTypes.REPLY,
                id: reply.id,
                text: replyText,
              })
              expect(results[1]).toMatchObject({
                __typename: TweetTypes.TWEET,
                id: tweet.id,
                text,
              })
            },
            {
              retries: 5,
              maxTimeout: 1000,
            },
          )
        })
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
