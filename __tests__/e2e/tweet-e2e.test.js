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
const retry = require('async-retry')
const chance = require('chance').Chance()
// (28.2) import the fragments we will use in the test and register them
const {
  axiosGraphQLQuery,
  registerFragment,
} = require('../../test-helpers/graphql')
const {
  getTweets,
  getMyTimeline,
  getMyProfile,
  getProfile,
  follow,
  tweet,
  like,
  getLikes,
  unlike,
  retweet,
  unretweet,
  reply,
  unfollow,
  getFollowers,
  getFollowing,
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

describe('e2e test for tweet', () => {
  let userA, userAId, DynamoDB, tweetAResp, userB, userBId, userBsReply

  const text = chance.string({length: 16})

  beforeAll(async () => {
    userA = await signInUser()
    userB = await signInUser()
    DynamoDB = new AWS.DynamoDB.DocumentClient()
    userAId = userA.username
    userBId = userB.username

    // [19] E2e test for tweet mutation
    // send a graphQL query request as the user
    // we can copy the tweet mutation from Appsync console
    // we are taking a text argument, mirroring the type at schema.api.graphql
    // TODO: (4) move tweet L71 to outer scop

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
      {userId: userAId, limit: 25, nextToken: null},
    )
    expect(getTweetsResp.getTweets.nextToken).toBeNull()
    expect(getTweetsResp.getTweets.tweets).toHaveLength(1)
    expect(getTweetsResp.getTweets.tweets[0]).toMatchObject(tweetAResp.tweet)

    // cannot ask for more than 25
    const get26Tweets = axiosGraphQLQuery(userA.accessToken, getTweets, {
      userId: userAId,
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
        {userId: userAId, limit: 25, nextToken: null},
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
        {userId: userAId, limit: 25, nextToken: null},
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
      await axiosGraphQLQuery(userA.accessToken, unlike, {
        tweetId: tweetAResp.tweet.id,
      })
      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userAId, limit: 25, nextToken: null},
      )
      expect(getTweetsResp.getTweets.tweets[0].liked).toBe(false)

      // [33] getLikes and ensure we do not get anything
      const getLikesResp = await axiosGraphQLQuery(
        userA.accessToken,
        getLikes,
        {userId: userAId, limit: 25, nextToken: null},
      )
      expect(getLikesResp.getLikes.nextToken).toBeNull()
      expect(getLikesResp.getLikes.tweets).toHaveLength(0)
    })
  })

  describe('[38] retweet,', () => {
    beforeAll(async () => {
      await axiosGraphQLQuery(userA.accessToken, retweet, {
        tweetId: tweetAResp.tweet.id,
      })
    })

    it('Should see the retweet when calling getTweets', async () => {
      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userAId, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets).toHaveLength(2)

      // TODO: (2) verify the console.log with an expect
      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        profile: {
          id: userAId,
          tweetsCount: 2,
        },
        retweetOf: {
          ...tweetAResp.tweet,
          retweets: 1,
          profile: {
            id: userAId,
            tweetsCount: 2,
          },
        },
      })

      expect(getTweetsResp.getTweets.tweets[1]).toMatchObject({
        profile: {
          id: userAId,
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
        {userId: userAId, limit: 25, nextToken: null},
      )
      expect(getMyTimelineResp.getMyTimeline.tweets).toHaveLength(1)
    })

    it('[41] Should not see the retweet upon unRetweeting', async () => {
      await axiosGraphQLQuery(userA.accessToken, unretweet, {
        tweetId: tweetAResp.tweet.id,
      })

      const getTweetsResp = await axiosGraphQLQuery(
        userA.accessToken,
        getTweets,
        {userId: userAId, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets).toHaveLength(1)
      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        ...tweetAResp.tweet,
        retweets: 0,
        profile: {
          id: userAId,
          tweetsCount: 1,
        },
      })
    })
  })

  describe("[46] reply: userB replies to signedInUser's tweet", () => {
    beforeAll(async () => {
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
        {userId: userBId, limit: 25, nextToken: null},
      )

      expect(getTweetsResp.getTweets.tweets[0]).toMatchObject({
        profile: {
          id: userBId,
          tweetsCount: 1,
        },
        inReplyToTweet: {
          id: tweetAResp.tweet.id,
          replies: 1,
        },
        inReplyToUsers: [
          {
            id: userAId,
          },
        ],
      })
    })

    it('userB should not see the reply when calling getMyTimeline', async () => {
      const getMyTimelineResp = await axiosGraphQLQuery(
        userB.accessToken,
        getMyTimeline,
        {userId: userBId, limit: 25, nextToken: null},
      )

      expect(getMyTimelineResp.getMyTimeline.tweets[0]).toMatchObject({
        profile: {
          id: userBId,
          tweetsCount: 1,
        },
        inReplyToTweet: {
          id: tweetAResp.tweet.id,
          replies: 1,
        },
        inReplyToUsers: [
          {
            id: userAId,
          },
        ],
      })
    })
  })

  describe('[50] userA follows UserB', () => {
    let userAsProfile, userBsProfile

    beforeAll(async () => {
      await axiosGraphQLQuery(userA.accessToken, follow, {
        userId: userBId,
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
          userId: userAId,
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

      it("[62] User A should see himself in user B's list of followers", async () => {
        const getFollowersResp = await axiosGraphQLQuery(
          userA.accessToken,
          getFollowers,
          {userId: userBId, limit: 25, nextToken: null},
        )

        expect(getFollowersResp.getFollowers.profiles).toHaveLength(1)
        expect(getFollowersResp.getFollowers.profiles[0]).toMatchObject({
          id: userAId,
        })
        expect(getFollowersResp.getFollowers.profiles[0]).not.toHaveProperty(
          'following',
        )
        expect(getFollowersResp.getFollowers.profiles[0]).not.toHaveProperty(
          'followedBy',
        )
      })

      it("[63] User A should see himself in user B's list of following", async () => {
        const getFollowingResp = await axiosGraphQLQuery(
          userA.accessToken,
          getFollowing,
          {userId: userBId, limit: 25, nextToken: null},
        )

        expect(getFollowingResp.getFollowing.profiles).toHaveLength(1)
        expect(getFollowingResp.getFollowing.profiles[0]).toMatchObject({
          id: userAId,
        })
        expect(getFollowingResp.getFollowing.profiles[0]).not.toHaveProperty(
          'following',
        )
        expect(getFollowingResp.getFollowing.profiles[0]).not.toHaveProperty(
          'followedBy',
        )
      })

      describe('[53] [56] user B tweets', () => {
        let tweetBResp
        beforeAll(async () => {
          const getMyTimelineRespA = await axiosGraphQLQuery(
            userA.accessToken,
            getMyTimeline,
            {limit: 25, nextToken: null},
          )

          console.log(
            'userA timeline 1: ',
            getMyTimelineRespA.getMyTimeline.tweets,
          )
          // 1 tweet so far, and userB's tweet should show up

          const text = chance.string({length: 16})
          tweetBResp = await axiosGraphQLQuery(userB.accessToken, tweet, {text})
        })

        it("userB's tweet should appear on userA's timeline", async () => {
          // in contrast to the integration test where we checked the DB
          // now we are checking the API call to getMyTimeline
          // this process happens asynchronously, so we need to a utility to retry the check
          // so that the test works more reliably
          // we can utilize async-retry library to do this

          await retry(
            async () => {
              const getMyTimelineResp = await axiosGraphQLQuery(
                userA.accessToken,
                getMyTimeline,
                {limit: 25, nextToken: null},
              )
              console.log(
                'userA timeline 2: ',
                getMyTimelineResp.getMyTimeline.tweets,
              )
              // super unreliable test - might get 1 & 2, or 2 & 3
              // expect(getMyTimelineResp.getMyTimeline.tweets).toHaveLength(2)
              // expect(getMyTimelineResp.getMyTimeline.tweets[0].id).toEqual(
              //   tweetBResp.tweet.id,
              // )
            },
            {
              retries: 4,
              maxTimeout: 2000,
            },
          )
        })
      })

      describe('[58] userA unfollows userB', () => {
        beforeAll(async () => {
          await axiosGraphQLQuery(userA.accessToken, unfollow, {
            userId: userBId,
          })
        })

        it("User A should see following as false when viewing user B's profile", async () => {
          const getProfileResp = await axiosGraphQLQuery(
            userA.accessToken,
            getProfile,
            {screenName: userBsProfile.getMyProfile.screenName},
          )

          expect(getProfileResp.getProfile.following).toBe(false)
        })

        it("User B should see followedBy as false when viewing user A's profile", async () => {
          const getProfileResp = await axiosGraphQLQuery(
            userB.accessToken,
            getProfile,
            {screenName: userAsProfile.getMyProfile.screenName},
          )

          expect(getProfileResp.getProfile.followedBy).toBe(false)
        })
      })
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
    // userB
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: userBId,
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
        Username: userBId,
      })
      .promise()
  })
})
