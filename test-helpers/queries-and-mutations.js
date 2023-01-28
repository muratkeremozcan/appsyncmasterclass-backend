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

module.exports = {
  getTweets,
  getMyTimeline,
  getMyProfile,
  getProfile,
}
