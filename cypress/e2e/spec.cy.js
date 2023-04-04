import 'cypress-map'

describe('template spec', () => {
  it('passes', () => {
    // log out environment variables

    cy.exec('git rev-parse --abbrev-ref HEAD')
      .its('stdout')
      .print()
      .should('eq', Cypress.env('STAGE'))
    expect(Cypress.env('AWS_NODEJS_CONNECTION_REUSE_ENABLED')).to.eq('1')
    expect(Cypress.env('AWS_REGION')).to.eq('eu-west-1')
  })
})
