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
