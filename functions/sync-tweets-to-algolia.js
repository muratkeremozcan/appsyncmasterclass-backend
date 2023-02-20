// (64.2) Create the lambda handlers for Algolia sync
const DynamoDB = require('aws-sdk/clients/dynamodb')
const middy = require('@middy/core')
const ssm = require('@middy/ssm')
const {initTweetsIndex} = require('../lib/algolia')
const {TweetTypes} = require('../lib/constants')

const {STAGE} = process.env

// (65.2) Use Middy SSM middleware to fetch the parameters and cache them.
// We use `setToContext` to add the env vars to the context object instead  of env vars
module.exports.handler = middy(async (event, context) => {
  // initialize the Algolia index
  const index = await initTweetsIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      // get the information of the profile (unmarshall converts the DynamoDB record into a JS object)
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)

      if (tweet.__typename === TweetTypes.RETWEET) {
        // if it's a retweet, we don't want to index it
        continue
      }
      // a record in Algolia needs a unique ID, we just make up one
      tweet.objectID = tweet.id
      // save the record to Algolia
      await index.saveObjects([tweet])
    } else if (record.eventName === 'REMOVE') {
      // whenever data is removed, delete it from Algolia
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)

      if (tweet.__typename === TweetTypes.RETWEET) {
        // if it's a retweet, we don't want to index it
        continue
      }

      await index.deleteObjects([tweet.id])
    }
  }
}).use(
  ssm({
    cache: true,
    cacheExpiryInMillis: 5 * 60 * 1000, // 5 mins
    names: {
      ALGOLIA_APP_ID: `/${STAGE}/algolia-app-id`,
      ALGOLIA_WRITE_KEY: `/${STAGE}/algolia-admin-key`,
    },
    setToContext: true,
    throwOnFailedCall: true,
  }),
)
