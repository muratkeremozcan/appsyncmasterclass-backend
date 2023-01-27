// [19] E2e test for tweet mutation
/// As a signed in user, make a graphQL request with the mutation `tweet`.
/// This will cause 3 db interactions. We do not have to repeat the same DB verifications as the integration test,
/// but we can verify the response from the mutation.
// - Sign in
// - Make a graphQL request with the tweet mutation and its text argument.
// - Check the content of the response for the mutation
// [24] E2e test for getMyTimeline query
// - Create the tweet (17)
// - getMyTimeline
// - Test error case of 26 limit.
require('dotenv').config()
const AWS = require('aws-sdk')
const {signInUser} = require('../../test-helpers/cognito')
const chance = require('chance').Chance()
// (28.2) import the fragments we will use in the test and register them
const {
  axiosGraphQLQuery,
  registerFragment,
} = require('../../test-helpers/graphql')
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

describe('e2e test for tweet', () => {
  let userA, DynamoDB, tweetAResp, userB, userBsReply

  const text = chance.string({length: 16})

  // [18] E2e test for getTweets query
  // create the query
  const getTweets = `query getTweets($userId: ID!, $limit: Int!, $nextToken: String) {
    getTweets(userId: $userId, limit: $limit, nextToken: $nextToken) {
      nextToken
      tweets {
        ... iTweetFields
        }
      }
    }`

  // [24] E2e test for getMyTimeline
  // create the query
  const getMyTimeline = `query getMyTimeline($limit: Int!, $nextToken: String) {
    getMyTimeline(limit: $limit, nextToken: $nextToken) {
      nextToken
      tweets {
        ... iTweetFields
      }
    }
  }`

  // [50] E2e test for follow mutation
  const getMyProfile = `query getMyProfile {
    getMyProfile {
      ... myProfileFields

      tweets {
        nextToken
        tweets {
          ... iTweetFields
        }
      }
    }
  }`

  // [50] E2e test for follow mutation
  const getProfile = `query getProfile($screenName: String!) {
    getProfile(screenName: $screenName) {
      ... otherProfileFields

      tweets {
        nextToken
        tweets {
          ... iTweetFields
        }
      }
    }
  }`

  beforeAll(async () => {
    userA = await signInUser()
    userB = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()

    // [19] E2e test for tweet mutation
    // send a graphQL query request as the user
    // we can copy the tweet mutation from Appsync console
    // we are taking a text argument, mirroring the type at schema.api.graphql
    // TODO: (4) move tweet L71 to outer scop
    const tweet = `mutation tweet($text: String!) { 
      tweet(text: $text) {
        id
        profile {
          ... iProfileFields
        }
        createdAt
        text
        replies
        likes
        retweets
        liked
      }
    }`

    // Make a graphQL request with the tweet mutation and its text argument
    tweetAResp = await axiosGraphQLQuery(userA.accessToken, tweet, {text})
  })

  it('[19] mutation; should check the content of the response', async () => {
    // Check the content of the response for the  mutation (no need to repeat the integration test DDB verifications,
    // so long as we got a response, DDB transactions already happened).
    expect(tweetAResp.tweet).toMatchObject({
      text,
      replies: 0,
      likes: 0,
      retweets: 0,
      liked: false,
    })
  })

  it('[18] getTweets query', async () => {
    // make a graphQL request and check the response
    const getTweetsResp = await axiosGraphQLQuery(
      userA.accessToken,
      getTweets,
      {userId: userA.username, limit: 25, nextToken: null},
    )
    expect(getTweetsResp.getTweets.nextToken).toBeNull()
    expect(getTweetsResp.getTweets.tweets).toHaveLength(1)
    expect(getTweetsResp.getTweets.tweets[0]).toMatchObject(tweetAResp.tweet)

    // cannot ask for more than 25
    const get26Tweets = axiosGraphQLQuery(userA.accessToken, getTweets, {
      userId: userA.username,
      limit: 26,
      nextToken: null,
    })
    await expect(get26Tweets).rejects.toMatchObject({
      message: expect.stringContaining('max limit is 25'),
    })
  })

  it('[24] getTimeline query', async () => {
    // make a graphQL request and check the response
    const getMyTimelineResp = await axiosGraphQLQuery(
      userA.accessToken,
      getMyTimeline,
      {limit: 25, nextToken: null},
    )
    expect(getMyTimelineResp.getMyTimeline.nextToken).toBeNull()
    expect(getMyTimelineResp.getMyTimeline.tweets).toHaveLength(1)
    expect(getMyTimelineResp.getMyTimeline.tweets[0]).toMatchObject(
      tweetAResp.tweet,
    )

    // cannot ask for more than 25
    const get26MyTimeline = axiosGraphQLQuery(
      userA.accessToken,
      getMyTimeline,
      {limit: 26, nextToken: null},
    )
    await expect(get26MyTimeline).rejects.toMatchObject({
      message: expect.stringContaining('max limit is 25'),
    })
  })

  describe('[29] [33] [31] like, getLikes, unlike', () => {
    const like = `mutation like($tweetId: ID!) {
      like(tweetId: $tweetId)
    }`
    // [33] getLikes query
    // create the query
    const getLikes = `query getLikes($userId: ID!, $limit: Int!, $nextToken: String) {
        getLikes(userId: $userId, limit: $limit, nextToken: $nextToken) {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }`
    beforeAll(async () => {
      // [29] like the tweet
      await axiosGraphQLQuery(userA.accessToken, like, {
        tweetId: tweetAResp.tweet.id,
      })
    })

    it('[29] like mutation, [33] getLikes query: should update the tweet to liked and check it', async () => {
      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userA.username, limit: 25, nextToken: null},
      )
      expect(getTweetsResp.getTweets.tweets[0].liked).toBe(true)
      // cannot like the same tweet twice
      await expect(
        axiosGraphQLQuery(userA.accessToken, like, {
          tweetId: tweetAResp.tweet.id,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('DynamoDB transaction error'),
      })

      // [33] getLikes query
      // make a graphQL request and check the response
      const getLikesResp = await axiosGraphQLQuery(
        userA.accessToken,
        getLikes,
        {userId: userA.username, limit: 25, nextToken: null},
      )
      expect(getLikesResp.getLikes.nextToken).toBeNull()
      expect(getLikesResp.getLikes.tweets).toHaveLength(1)
      expect(getLikesResp.getLikes.tweets[0]).toMatchObject({
        ...tweetAResp.tweet,
        liked: true,
        likes: 1,
        profile: {
          ...tweetAResp.tweet.profile,
          likesCounts: 1,
        },
      })
    })

    it('[31] unlike mutation, [33] getLikes query: should update the tweet to un-liked and check it', async () => {
      const unlike = `mutation unlike($tweetId: ID!) {
        unlike(tweetId: $tweetId)
      }`
      await axiosGraphQLQuery(userA.accessToken, unlike, {
        tweetId: tweetAResp.tweet.id,
      })
      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userA.username, limit: 25, nextToken: null},
      )
      expect(getTweetsResp.getTweets.tweets[0].liked).toBe(false)

      // [33] getLikes and ensure we do not get anything
      const getLikesResp = await axiosGraphQLQuery(
        userA.accessToken,
        getLikes,
        {userId: userA.username, limit: 25, nextToken: null},
      )
      expect(getLikesResp.getLikes.nextToken).toBeNull()
      expect(getLikesResp.getLikes.tweets).toHaveLength(0)
    })
  })

  describe('[38] retweet,', () => {
    beforeAll(async () => {
      const retweet = `mutation retweet($tweetId: ID!) {
        retweet(tweetId: $tweetId) {
          ... retweetFields
        }
      }`

      await axiosGraphQLQuery(userA.accessToken, retweet, {
        tweetId: tweetAResp.tweet.id,
      })
    })

    it('Should see the retweet when calling getTweets', async () => {
      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userA.username, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets).toHaveLength(2)

      // TODO: (2) verify the console.log with an expect
      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        profile: {
          id: userA.username,
          tweetsCount: 2,
        },
        retweetOf: {
          ...tweetAResp.tweet,
          retweets: 1,
          profile: {
            id: userA.username,
            tweetsCount: 2,
          },
        },
      })

      expect(getTweetsResp.getTweets.tweets[1]).toMatchObject({
        profile: {
          id: userA.username,
          tweetsCount: 2,
        },
        retweets: 1,
      })
      // other user case is covered in integration, so we don't need to test it here
      // it would be nice to have, but we are running into LimitExceededException errors
      // there is no functional workaround so far
      // https://school.theburningmonk.com/communities/Q29tbXVuaXR5LTc2MDU=/post/UG9zdC01OTQxODU1/
    })

    it('should not see the retweet when calling getMyTimeline', async () => {
      const getMyTimelineResp = await axiosGraphQLQuery(
        userA.accessToken,
        getMyTimeline,
        {userId: userA.username, limit: 25, nextToken: null},
      )
      expect(getMyTimelineResp.getMyTimeline.tweets).toHaveLength(1)
    })

    it('[41] Should not see the retweet upon unRetweeting', async () => {
      const unretweet = `mutation unretweet($tweetId: ID!) {
      unretweet(tweetId: $tweetId)
    }`

      await axiosGraphQLQuery(userA.accessToken, unretweet, {
        tweetId: tweetAResp.tweet.id,
      })

      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userA.username, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets).toHaveLength(1)
      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        ...tweetAResp.tweet,
        retweets: 0,
        profile: {
          id: userA.username,
          tweetsCount: 1,
        },
      })
    })
  })

  describe("[46] reply: userB replies to signedInUser's tweet", () => {
    beforeAll(async () => {
      const reply = `mutation reply($tweetId: ID!, $text: String!) {
        reply(tweetId: $tweetId, text: $text) {
          ... replyFields
        }
      }`
      const text = chance.string({length: 16})
      userBsReply = await axiosGraphQLQuery(userB.accessToken, reply, {
        tweetId: tweetAResp.tweet.id,
        text,
      })
    })

    it('userB should see the reply when calling getTweets', async () => {
      const getTweetsResp = await axiosGraphQLQuery(
        userB.accessToken,
        getTweets,
        {userId: userB.username, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        profile: {
          id: userB.username,
          tweetsCount: 1,
        },
        inReplyToTweet: {
          id: tweetAResp.tweet.id,
          replies: 1,
        },
        inReplyToUsers: [
          {
            id: userA.username,
          },
        ],
      })
    })

    it('userB should not see the reply when calling getMyTimeline', async () => {
      const getMyTimelineResp = await axiosGraphQLQuery(
        userB.accessToken,
        getMyTimeline,
        {userId: userB.username, limit: 25, nextToken: null},
      )

      expect(getMyTimelineResp.getMyTimeline.tweets[0]).toMatchObject({
        profile: {
          id: userB.username,
          tweetsCount: 1,
        },
        inReplyToTweet: {
          id: tweetAResp.tweet.id,
          replies: 1,
        },
        inReplyToUsers: [
          {
            id: userA.username,
          },
        ],
      })
    })
  })

  describe('[50] userA follows UserB', () => {
    let userAsProfile, userBsProfile
    const follow = `mutation follow($userId: ID!) {
      follow(userId: $userId)
    }`
    beforeAll(async () => {
      await axiosGraphQLQuery(userA.accessToken, follow, {
        userId: userB.username,
      })

      userAsProfile = await axiosGraphQLQuery(userA.accessToken, getMyProfile)
      userBsProfile = await axiosGraphQLQuery(userB.accessToken, getMyProfile)
    })

    it("User A should see following as true when viewing user B's profile", async () => {
      const getProfileResp = await axiosGraphQLQuery(
        userA.accessToken,
        getProfile,
        {screenName: userBsProfile.getMyProfile.screenName},
      )

      expect(getProfileResp.getProfile.following).toBe(true)
      expect(getProfileResp.getProfile.followedBy).toBe(false)
    })

    it("User B should see followedBy as true when viewing user A's profile", async () => {
      const getProfileResp = await axiosGraphQLQuery(
        userB.accessToken,
        getProfile,
        {screenName: userAsProfile.getMyProfile.screenName},
      )

      expect(getProfileResp.getProfile.following).toBe(false)
      expect(getProfileResp.getProfile.followedBy).toBe(true)
    })

    describe('userB follows userA back', () => {
      beforeAll(async () => {
        await axiosGraphQLQuery(userB.accessToken, follow, {
          userId: userA.username,
        })
      })

      it("User A should see following as true when viewing user B's profile", async () => {
        const getProfileResp = await axiosGraphQLQuery(
          userA.accessToken,
          getProfile,
          {screenName: userBsProfile.getMyProfile.screenName},
        )

        expect(getProfileResp.getProfile.following).toBe(true)
        expect(getProfileResp.getProfile.followedBy).toBe(true)
      })

      it("User B should see followedBy as true when viewing user A's profile", async () => {
        const getProfileResp = await axiosGraphQLQuery(
          userB.accessToken,
          getProfile,
          {screenName: userAsProfile.getMyProfile.screenName},
        )

        expect(getProfileResp.getProfile.following).toBe(true)
        expect(getProfileResp.getProfile.followedBy).toBe(true)
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
        id: tweetAResp.tweet.id,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TIMELINES_TABLE,
      Key: {
        userId: userA.username,
        tweetId: tweetAResp.tweet.id,
      },
    }).promise()

    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userA.userPoolId,
        Username: userA.username,
      })
      .promise()

    // userB
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userB.username,
      },
    }).promise()

    await DynamoDB.delete({
      TableName: process.env.TWEETS_TABLE,
      Key: {
        id: userBsReply.reply.id,
      },
    }).promise()

    await userA.cognito
      .adminDeleteUser({
        UserPoolId: userB.userPoolId,
        Username: userB.username,
      })
      .promise()
  })
})
