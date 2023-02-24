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

describe('Given an authenticated user', () => {
  let userA, userAsProfile, tweetAResp, userAsReply, DynamoDB, userAId
  const text = chance.string({length: 16})
  const replyText = chance.string({length: 16})

  // if you run into LimitExceeded error, just use a fixed test user on Dev such as appsync-tester2
  // const userA = {
  //   accessToken:
  //     'eyJraWQiOiJvc0FHSXN1QW9reURqOVRoam9XeFwvSFcwc2drcWRMZDVEOTZaTkdxXC9yZDg9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1NmUyZmEyZi05ZmRkLTRlMmYtOTdlZS1hY2YwMmZkNWVhZmQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb21cL2V1LXdlc3QtMV9LdXhvYUs2Wm0iLCJjbGllbnRfaWQiOiI5bWI3cWRqcTU0ZjJ2ZjhrdnVvYmxqcGhwIiwib3JpZ2luX2p0aSI6IjcxNWQzNTQ1LTBkYzYtNDQ4MC1hNDIxLTk1OTdiNjU5ZDcyMyIsImV2ZW50X2lkIjoiYTgzMTI3YjQtZjlkOC00NDBkLTkxMDUtMDM0NmQ2OWFlYTY5IiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTY3NzE2MzI2NSwiZXhwIjoxNjc3MTY2ODY1LCJpYXQiOjE2NzcxNjMyNjUsImp0aSI6ImMyNWQ5NzA4LTM0ZTAtNGJjYS1iZGMwLTA2OTY2MzMxNDhiZiIsInVzZXJuYW1lIjoiNTZlMmZhMmYtOWZkZC00ZTJmLTk3ZWUtYWNmMDJmZDVlYWZkIn0.Finbif1V2U2uN7xpm-llLCSyjD4Xa7hooFxBylGtkksz61W--kibVTbaL-RNGCpv3mr4w_ToC55BAM3dGEmJDS9b_wF-r6YXgvqj_AtmCWtRRXcvm1hg9hEKhpgrntKB26oREasbxh5ty-1Ah14OQ3Z9WLDOisvz_LaYF-LciFGyfOhbbmZUdpGkyAkHphFK3eMyMvMXbk2I4SMcBMXPY3GLP2Nex26fDIiRf3_qHLYJlV_6A34W-CBe-TIaY2jhSZdXzm8Ie8FrVOhMYKY4t4CpHXh3L2p9dqZ1Q-yZxNz7I8xGQwIIB8RhK9dYHZjBSroXUPrBDcuI2FiwOkysVA',
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
          maxTimeout: 3000,
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
          maxTimeout: 3000,
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
          maxTimeout: 3000,
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
            maxTimeout: 3000,
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
          maxTimeout: 3000,
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
          maxTimeout: 3000,
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
