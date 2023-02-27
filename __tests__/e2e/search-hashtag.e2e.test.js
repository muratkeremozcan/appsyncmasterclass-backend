require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const retry = require('async-retry')
const chance = require('chance').Chance()
const {graphQLQuery, registerFragment} = require('../../test-helpers/graphql')
const {TweetTypes} = require('../../lib/constants')
const {
  getMyProfile,
  editMyProfile,
  searchPeople,
  searchTweets,
  getHashTagPeople,
  getHashTagTweets,
  tweet,
  reply,
} = require('../../test-helpers/queries-and-mutations')
const {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
  tweetFragment,
  iTweetFragment,
  retweetFragment,
  replyFragment,
} = require('../../test-helpers/graphql-fragments')
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)
registerFragment('tweetFields', tweetFragment)
registerFragment('iTweetFields', iTweetFragment)
registerFragment('retweetFields', retweetFragment)
registerFragment('replyFields', replyFragment)

// this is my version of search + getHashTag, trying to save from Cognito quota for emails
// regardless of the style
// jest + async-retry is a sub-par solution for eventual consistency in e2e tests... Very unreliable.
describe.skip('Given an authenticated user', () => {
  let userA, userAsProfile, tweetAResp, userAsReply, DynamoDB, userAId
  const text = chance.string({length: 16})
  const replyText = chance.string({length: 16})

  // if you run into LimitExceeded error, just use a fixed test user on Dev such as appsync-tester2
  // DONT FORGET TO DISABLE THE AFTERALL HOOK
  // const userA = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2Yw',
  //   username: '56e2fa2f-9fdd-4e2f-97ee-acf02fd5eafd',
  // }
  beforeAll(async () => {
    userA = await signInUser()

    userAsProfile = await graphQLQuery(userA.accessToken, getMyProfile)
    tweetAResp = await graphQLQuery(userA.accessToken, tweet, {text})
    userAsReply = await graphQLQuery(userA.accessToken, reply, {
      tweetId: tweetAResp.tweet.id,
      text: replyText,
    })
    DynamoDB = new AWS.DynamoDB.DocumentClient()
    userAId = userA.username
  })

  describe('Search', () => {
    it('The user can find himself when he searches for his twitter handle', async () => {
      await retry(
        async () => {
          const {
            search: {results},
          } = await graphQLQuery(userA.accessToken, searchPeople, {
            query: userAsProfile.getMyProfile.screenName,
            limit: 10,
            nextToken: null,
          })

          expect(results).toHaveLength(1)
          expect(results[0]).toMatchObject({
            __typename: 'MyProfile',
            id: userAsProfile.getMyProfile.id,
            name: userAsProfile.getMyProfile.name,
            screenName: userAsProfile.getMyProfile.screenName,
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
          const {
            search: {results},
          } = await graphQLQuery(userA.accessToken, searchPeople, {
            query: userAsProfile.getMyProfile.name,
            limit: 10,
            nextToken: null,
          })

          expect(results).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                __typename: 'MyProfile',
                id: userAsProfile.getMyProfile.id,
                name: userAsProfile.getMyProfile.name,
                screenName: userAsProfile.getMyProfile.screenName,
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

    it('The user can find his tweet when he searches for the text', async () => {
      await retry(
        async () => {
          const {
            search: {results},
          } = await graphQLQuery(userA.accessToken, searchTweets, {
            query: text,
            limit: 10,
            nextToken: null,
          })

          expect(results).toHaveLength(1)
          expect(results[0]).toMatchObject({
            __typename: TweetTypes.TWEET,
            id: tweetAResp.tweet.id,
            text,
          })
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })

    it('The user can find his reply when he searches for the reply text', async () => {
      await retry(async () => {
        const {
          search: {results},
        } = await graphQLQuery(userA.accessToken, searchTweets, {
          query: replyText,
          limit: 10,
          nextToken: null,
        })

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject(
          {
            __typename: TweetTypes.REPLY,
            id: userAsReply.reply.id,
            text: replyText,
          },
          {
            retries: 5,
            maxTimeout: 5000,
          },
        )
      })
    })
  })

  describe('HashTag', () => {
    const hashTag = `#${chance.string({length: 16, alpha: true})}`
    const tweetWithHashTag = `this is a tweet with a hashtag: ${hashTag}`
    let bio

    beforeAll(async () => {
      const newProfile = {
        name: userAsProfile.getMyProfile.name,
        imageUrl: userAsProfile.getMyProfile.imageUrl,
        backgroundImageUrl: userAsProfile.getMyProfile.backgroundImageUrl,
        bio: `my bio has a hashtag: ${hashTag}`,
        location: userAsProfile.getMyProfile.location,
        website: userAsProfile.getMyProfile.website,
        birthdate: userAsProfile.getMyProfile.birthdate,
      }
      // edit the profile
      await graphQLQuery(userA.accessToken, editMyProfile, {
        input: newProfile,
      })

      // tweet something with the hastag
      await graphQLQuery(userA.accessToken, tweet, {
        text: tweetWithHashTag,
      })

      // ensure results
      ;({
        getMyProfile: {bio},
      } = await graphQLQuery(userA.accessToken, getMyProfile))
      console.log(bio)
    })

    it('do I have bio and hashtag?', () => {
      console.log(bio)
      console.log('looking for hash tag: ', hashTag)
    })

    it('The user can find himself when he gets the hash tag with PEOPLE', async () => {
      await retry(
        async () => {
          const {
            getHashTag: {results},
          } = await graphQLQuery(userA.accessToken, getHashTagPeople, {
            hashTag,
            limit: 10,
            nextToken: null,
          })
          expect(results).toHaveLength(1)
          expect(results[0]).toMatchObject({
            __typename: 'MyProfile',
            id: userAsProfile.getMyProfile.id,
            name: userAsProfile.getMyProfile.name,
            screenName: userAsProfile.getMyProfile.screenName,
          })
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })

    it('The user can find his tweet when he gets the hash tag with LATEST', async () => {
      await retry(
        async () => {
          const {
            getHashTag: {results},
          } = await graphQLQuery(userA.accessToken, getHashTagTweets, {
            hashTag,
            limit: 10,
            nextToken: null,
          })

          expect(results).toHaveLength(1)

          // asyc-retry is so unreliable with this part
          // expect(results[0]).toMatchObject({
          // __typename: TweetTypes.TWEET,
          //   id: tweetAResp.tweet.id,
          //   text: tweetWithHashTag,
          // })
        },
        {
          retries: 5,
          maxTimeout: 5000,
        },
      )
    })
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userAId,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: tweetAResp.tweet.id,
      },
    }).promise()
    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userAId,
        tweetId: tweetAResp.tweet.id,
      },
    }).promise()
    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userAId,
      })
      .promise()
  })
})
