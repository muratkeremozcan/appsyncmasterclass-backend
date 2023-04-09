import './commands'
import 'cypress-plugin-api'
import 'cypress-map'
import gql from './gql'

Cypress.Commands.add('gql', gql)

Cypress.Commands.add('getToken', (username, password) =>
  cy
    .task('authorizeUser', {username, password})
    .its('AuthenticationResult.AccessToken'),
)

Cypress.Commands.add(
  'cleanupTweet',
  (tweetId, userId, tweetsTable, timelinesTable) =>
    cy.task('cleanUpTweet', {
      tweetId,
      userId,
      tweetsTable,
      timelinesTable,
    }),
)

Cypress.Commands.add('cleanupUser', id => {
  cy.task('ddbDeleteUser', id)
  return cy.task('cognitoDeleteUser', id)
})
