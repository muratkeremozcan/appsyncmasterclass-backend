// (64.2) Create the lambda handlers for Algolia sync
// Similar to distributeTweets (51.1)
const DynamoDB = require('aws-sdk/clients/dynamodb')
const {initUsersIndex} = require('../lib/algolia')
const middy = require('@middy/core')
const ssm = require('@middy/ssm')

const {STAGE} = process.env

// (65.2) Use Middy SSM middleware to fetch the parameters and cache them.
// We use `setToContext` to add the env vars to the context object instead  of env vars
module.exports.handler = middy(async (event, context) => {
  // initialize the Algolia index
  const index = await initUsersIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  for (const record of event.Records) {
    // whenever data is inserted or updated
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      // get the information of the profile (unmarshall converts the DynamoDB record into a JS object)
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
      // a record in Algolia needs a unique ID, we just make up one
      profile.objectID = profile.id
      // save the record to Algolia
      await index.saveObjects([profile])
    } else if (record.eventName === 'REMOVE') {
      // whenever data is removed, delete it from Algolia
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)

      await index.deleteObjects([profile.id])
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
