import spok from 'cy-spok'
const {
  getTweets,

  tweet,
} = require('../../test-helpers/queries-and-mutations')
const chance = require('chance').Chance()

describe('e2e test for tweet', () => {
  let token, tweetAResp
  const text = chance.string({length: 16})
  // let userAId

  // before(() => {
  //   cy.task('signInUser').then(({username, idToken}) => {
  //     userAId = username
  //     token = idToken

  //     cy.gql({
  //       token,
  //       query: tweet,
  //       variables: {text},
  //     }).then(tResp => {
  //       tweetAResp = tResp
  //     })
  //   })
  // })
  const userAId = '2dd25fa2-5d3d-42f0-9891-94482d468081'
  const password = 'Password-1'

  before(() => {
    cy.getToken(userAId, password).then(t => {
      token = t // used later...
      cy.gql({
        token,
        query: tweet,
        variables: {text},
      }).then(tResp => {
        tweetAResp = tResp
      })
    })
  })

  it('[19] mutation; should check the content of the response', () => {
    cy.wrap(tweetAResp).should(
      spok({
        text,
        replies: 0,
        likes: 0,
        retweets: 0,
        liked: false,
      }),
    )
  })

  it('[22] getTweets query', () => {
    cy.gql({
      token,
      query: getTweets,
      variables: {
        userId: userAId,
        limit: 25,
        nextToken: null,
      },
    }).should(
      spok({
        nextToken: n => n === null || typeof n === 'string',
        tweets: arr => arr.length > 0,
      }),
    )

    cy.log('**cannot ask for more than 25 tweets**')
    cy.gql({
      token,
      query: getTweets,
      variables: {
        userId: userAId,
        limit: 26,
        nextToken: null,
      },
      checkError: true,
    })
      .its('message')
      .should('eq', 'max limit is 25')
  })

  after(() => {
    cy.cleanupTweet(tweetAResp.id, userAId)
    cy.cleanupUser(userAId)
  })
})
