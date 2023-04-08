const {
  generateUser,
  signUpUser,
  signInUser,
  cleanUpUser,
  authorizeUser,
} = require('../../test-helpers/cognito')
const {ddbGetUser, ddbDeleteUser} = require('../../test-helpers/tasks/ddb')
const {cognitoDeleteUser} = require('../../test-helpers/tasks/cognito')
const {deleteS3Item} = require('../../test-helpers/tasks/s3')

function tasks(on) {
  on('task', {
    generateUser,
    signUpUser,
    signInUser,
    cleanUpUser,
    authorizeUser,
    ddbGetUser,
    ddbDeleteUser,
    cognitoDeleteUser,
    deleteS3Item,
  })
}

module.exports = tasks
