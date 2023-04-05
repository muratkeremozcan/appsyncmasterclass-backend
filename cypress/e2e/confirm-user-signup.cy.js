import spok from 'cy-spok'

describe('When a user signs up', () => {
  it("The user's profile should be saved in DynamoDB", () => {
    cy.task('signUpUser').then(({name, username}) => {
      const [firstName, lastName] = name.split(' ')

      cy.task('ddbGetUser', username)
        .its('Item')
        .should(
          spok({
            id: username,
            name,
            createdAt: s =>
              expect(s).to.match(
                /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?Z?/g,
              ),
            followersCount: 0,
            followingCount: 0,
            tweetsCount: 0,
            likesCounts: 0,
            screenName: s =>
              expect(s).to.contain(firstName) && expect(s).to.contain(lastName),
          }),
        )

      cy.task('ddbDeleteUser', username)

      cy.task('cognitoDeleteUser', username)
    })
  })
})
