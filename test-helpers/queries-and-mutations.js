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

const editMyProfile = `mutation editMyProfile($input: ProfileInput!) {
      editMyProfile(newProfile: $input) {
        ... myProfileFields
  
        tweets {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }
    }`

const follow = `mutation follow($userId: ID!) {
      follow(userId: $userId)
    }`

const unfollow = `mutation unfollow($userId: ID!) {
      unfollow(userId: $userId)
    }`

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

const retweet = `mutation retweet($tweetId: ID!) {
        retweet(tweetId: $tweetId) {
          ... retweetFields
        }
      }`

const unretweet = `mutation unretweet($tweetId: ID!) {
      unretweet(tweetId: $tweetId)
    }`

const reply = `mutation reply($tweetId: ID!, $text: String!) {
        reply(tweetId: $tweetId, text: $text) {
          ... replyFields
        }
      }`

const like = `mutation like($tweetId: ID!) {
      like(tweetId: $tweetId)
    }`

const getLikes = `query getLikes($userId: ID!, $limit: Int!, $nextToken: String) {
        getLikes(userId: $userId, limit: $limit, nextToken: $nextToken) {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }`

const unlike = `mutation unlike($tweetId: ID!) {
        unlike(tweetId: $tweetId)
      }`

const getFollowers = `query getFollowers($userId: ID!, $limit: Int!, $nextToken: String) {
        getFollowers(userId: $userId, limit: $limit, nextToken: $nextToken) {
          profiles {
            ... iProfileFields
          }
        }
      }`

const getFollowing = `query getFollowing($userId: ID!, $limit: Int!, $nextToken: String) {
        getFollowing(userId: $userId, limit: $limit, nextToken: $nextToken) {
          profiles {
            ... iProfileFields
          }
        }
      }`

module.exports = {
  getTweets,
  getMyTimeline,
  getMyProfile,
  getProfile,
  editMyProfile,
  follow,
  unfollow,
  tweet,
  like,
  getLikes,
  unlike,
  retweet,
  unretweet,
  reply,
  getFollowers,
  getFollowing,
}
