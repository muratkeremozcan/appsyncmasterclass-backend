const {
  generateUser,
  signUpUser,
  signInUser,
  cleanUpUser,
  authorizeUser,
} = require('../../test-helpers/cognito')
const {
  ddbGetUser,
  ddbDeleteUser,
  ddbDeleteTweet,
  ddbDeleteTweetAndTimeline,
} = require('../../test-helpers/tasks/ddb')
const {cognitoDeleteUser} = require('../../test-helpers/tasks/cognito')
const {deleteS3Item} = require('../../test-helpers/tasks/s3')

// when working with a function that takes multiple args, and we want to wrap it in cy.task
// create an intermediate function that matches the cy.task api with multiple args
// cy.task must take an object with multiple args
const cleanUpTweet = ({
  tweetId,
  userId,
  tweetsTable = process.env.TWEETS_TABLE,
  timelinesTable = process.env.TIMELINES_TABLE,
}) => ddbDeleteTweetAndTimeline(tweetId, userId, tweetsTable, timelinesTable)

function tasks(on) {
  on('task', {
    generateUser,
    signUpUser,
    signInUser,
    cleanUpUser,
    authorizeUser,
    ddbGetUser,
    ddbDeleteUser,
    cleanUpTweet,
    cognitoDeleteUser,
    deleteS3Item,
    ddbDeleteTweet,
  })
}

module.exports = tasks
