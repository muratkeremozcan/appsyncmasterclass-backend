describe('template spec', () => {
  it('passes', () => {
    // log out environment variables
    cy.log(Cypress.env('STAGE'))
    cy.log(Cypress.env('AWS_NODEJS_CONNECTION_REUSE_ENABLED'))
    cy.log(Cypress.env('AWS_REGION'))
    cy.log(Cypress.env('COGNITO_USER_POOL_ID'))
  })
})
