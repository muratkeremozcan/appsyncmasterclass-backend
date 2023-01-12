// // [4.16] E2e test for tweet mutation
// require('dotenv').config()
// const AWS = require('aws-sdk')
// const {signInUser} = require('../../test-helpers/helpers')

// /**
//  * Generates an event object that can be used to test the lambda function
//  * @param {string} username - the id of the user who is tweeting
//  * @param {string} text - the text of the tweet
//  * @returns {Object} - event
//  */
// const generateTweetEvent = (username, text) => {
//   return {
//     identity: {
//       username: username,
//     },
//     arguments: {
//       text,
//     },
//   }
// }

// describe('Given an authenticated user', () => {
//   let signedInUser
//   beforeAll(async () => {
//     signedInUser = await signInUser()
//   })

//   it('should write the tweet to the Tweets, Timelines tables, and update Users table', async () => {
//     // create a mock event and feed it to the handler
//     const event = generateTweetEvent(signedInUser.username, 'Hello world!')

//     // verify the tables
//     const DynamoDB = new AWS.DynamoDB.DocumentClient()

//     const tweetsTableResp = await DynamoDB.get({
//       TableName: process.env.TWEETS_TABLE,
//       Key: {
//         id: tweet.id,
//       },
//     }).promise()
//     expect(tweetsTableResp.Item).toBeTruthy()

//     const timelinesTableResp = await DynamoDB.get({
//       TableName: process.env.TIMELINES_TABLE,
//       Key: {
//         userId: signedInUser.username,
//         tweetId: tweet.id,
//       },
//     }).promise()
//     expect(timelinesTableResp.Item).toBeTruthy()

//     const usersTableResp = await DynamoDB.get({
//       TableName: process.env.USERS_TABLE,
//       Key: {
//         id: signedInUser.username,
//       },
//     }).promise()
//     expect(usersTableResp.Item).toBeTruthy()
//     expect(usersTableResp.Item.tweetsCount).toEqual(1)
//   })

//   afterAll(async () => {
//     // clean up DynamoDB and Cognito
//     const DynamoDB = new AWS.DynamoDB.DocumentClient()
//     await DynamoDB.delete({
//       TableName: process.env.USERS_TABLE,
//       Key: {
//         id: signedInUser.username,
//       },
//     }).promise()

//     await signedInUser.cognito
//       .adminDeleteUser({
//         UserPoolId: signedInUser.userPoolId,
//         Username: signedInUser.username,
//       })
//       .promise()
//   })
// })
