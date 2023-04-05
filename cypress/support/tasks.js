const {
  generateUser,
  signUpUser,
  signInUser,
  cleanUpUser,
} = require('../../test-helpers/cognito')
const {ddbGetUser, ddbDeleteUser} = require('./tasks/ddb')
const {cognitoDeleteUser} = require('./tasks/cognito')

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
