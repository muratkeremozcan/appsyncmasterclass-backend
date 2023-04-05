const {
  generateUser,
  signUpUser,
  signInUser,
  cleanUpUser,
} = require('../../test-helpers/cognito')
const {ddbGetUser, ddbDeleteUser} = require('../../test-helpers/tasks/ddb')
const {cognitoDeleteUser} = require('../../test-helpers/tasks/cognito')

function tasks(on) {
  on('task', {
    generateUser,
    signUpUser,
    signInUser,
    cleanUpUser,
    ddbGetUser,
    ddbDeleteUser,
    cognitoDeleteUser,
  })
}

module.exports = tasks
