// (42.3) add the lambda function that will
// * Get from Tweets
// * Update Tweets and Users
// * Write to Tweets, Timelines
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')
const {getTweetById} = require('../lib/tweets')
const _ = require('lodash')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

async function getUserIdsToReplyTo(tweet) {
  let userIds = [tweet.creator]
  if (tweet.__typename === TweetTypes.REPLY) {
    userIds = userIds.concat(tweet.inReplyToUserIds)
  } else if (tweet.__typename === TweetTypes.RETWEET) {
    const retweetOf = await getTweetById(tweet.retweetOf)
    userIds = userIds.concat(await getUserIdsToReplyTo(retweetOf))
  }

  return _.uniq(userIds)
}
// ramda version
// const getUserIdsToReplyToR = async tweet => {
//   const retweetOf = await getTweetById(tweet.retweetOf)
//   return R.pipe(
//     x => (x.__typename === TweetTypes.REPLY ? x.inReplyToUserIds : []),
//     x =>
//       x.__typename === TweetTypes.RETWEET ? getUserIdsToReplyTo(retweetOf) : x,
//     x => [tweet.creator].concat(x),
//     R.uniq,
//   )(tweet)
// }

const handler = async event => {
  // we know from graphQL schema the arguments for reply - reply(tweetId: ID!, text: String!): Reply!
  // we can extract both from event.arguments
  const {tweetId, text} = event.arguments
  // we can get the username from event.identity.username
  // we need it because reply is like a new tweet, so we need to know who created it
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()

  // get from Tweets (we can use a helper)
  const tweet = await getTweetById(tweetId)

  if (!tweet) throw new Error('Tweet is not found')

  // get the user ids to reply to
  const inReplyToUserIds = await getUserIdsToReplyTo(tweet)

  /* from the schema:
		type Reply implements ITweet {
			id: ID!
			profile: IProfile!
			createdAt: AWSDateTime!
			inReplyToTweet: ITweet!
			inReplyToUsers: [IProfile!]
			text: String!
			replies: Int!
			likes: Int!
			retweets: Int!
			liked: Boolean!
			retweeted: Boolean!
		}
  */
  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.REPLY,
    id,
    creator: username,
    createdAt: timestamp,
    inReplyToTweetId: tweetId,
    inReplyToUserIds,
    text,
    replies: 0,
    likes: 0,
    retweets: 0,
  }

  // * Get from Tweets
  // * Update Tweets and Users
  // * Write to Tweets, Timelines (if we have write for tweetsTable, we have read too)

  const transactItems = [
    {
      Put: {
        TableName: TWEETS_TABLE,
        Item: newTweet,
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD replies :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: {
          id: username,
        },
        UpdateExpression: 'ADD tweetsCount :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Put: {
        TableName: TIMELINES_TABLE,
        Item: {
          userId: username,
          tweetId: id,
          timestamp,
          inReplyToTweetId: tweetId,
          inReplyToUserIds,
        },
      },
    },
  ]

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return true
}

module.exports = {
  handler,
}
