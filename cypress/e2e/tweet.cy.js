import spok from 'cy-spok'
const {
  getTweets,
  tweet,
  getMyTimeline,
  like,
  unlike,
  getLikes,
} = require('../../test-helpers/queries-and-mutations')
const chance = require('chance').Chance()

describe('e2e test for tweet', () => {
  let token, tweetAResp
  const text = chance.string({length: 16})
  let userAId

  before(() => {
    cy.task('signInUser').then(({username, idToken}) => {
      userAId = username
      token = idToken

      cy.gql({
        token,
        query: tweet,
        variables: {text},
      }).then(tResp => {
        tweetAResp = tResp
      })
    })
  })

  // const userAId = '8b226a8e-5611-4dec-a087-4316d515b478'
  // const password = 'Password-1'

  // before(() => {
  //   cy.getToken(userAId, password).then(t => {
  //     token = t // used later...
  //     cy.gql({
  //       token,
  //       query: tweet,
  //       variables: {text},
  //     }).then(tResp => {
  //       tweetAResp = tResp
  //     })
  //   })
  // })

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
      expectError: true,
    })
      .its('message')
      .should('eq', 'max limit is 25')
  })

  it('[24] getTimeline query', () => {
    cy.gql({
      token,
      query: getMyTimeline,
      variables: {
        limit: 25,
        nextToken: null,
      },
    })
      .should(
        spok({
          nextToken: n => n === null || typeof n === 'string',
          tweets: tweets => tweets.length > 0,
        }),
      )
      .its('tweets.0')
      .should(spok(tweetAResp))

    cy.log('**cannot ask for more than 25 tweets**')
    cy.gql({
      token,
      query: getMyTimeline,
      variables: {
        userId: userAId,
        limit: 26,
        nextToken: null,
      },
      expectError: true,
    })
      .its('message')
      .should('eq', 'max limit is 25')
  })

  describe('[29] [33] [31] like, getLikes, unlike', () => {
    // note: like + unlike and check is just one flow
    // in Jest , we want to make things easier to diagnose when they fail
    // that's why we use minimal it blocks and rely on hooks for test state
    // with Cypress we don't need any of that, we shape the it block per the flow

    const tweetLiked = () =>
      cy
        .gql({
          token,
          query: getTweets,
          variables: {
            userId: userAId,
            limit: 25,
            nextToken: null,
          },
        })
        .its('tweets.0.liked')

    const gqlGetLikes = () =>
      cy.gql({
        token,
        query: getLikes,
        variables: {
          userId: userAId,
          limit: 25,
          nextToken: null,
        },
      })

    it('[29] like mutation, [31] unlike mutation, [33] getLikes query should update the tweet to liked / unliked and check it', () => {
      cy.gql({
        token,
        query: like,
        variables: {tweetId: tweetAResp.id},
      })
      tweetLiked().should('eq', true)

      cy.log('**cannot like the same tweet twice**')
      cy.gql({
        token,
        query: like,
        variables: {tweetId: tweetAResp.id},
        expectError: true,
      })
        .its('message')
        .should('eq', 'DynamoDB transaction error')

      cy.log('**getLikes should show the liked tweet**')
      gqlGetLikes()
        .should(
          spok({
            tweets: arr => arr.length > 0,
          }),
        )
        .its('tweets.0')
        .should(
          spok({
            ...tweetAResp,
            liked: true,
            likes: 1,
            profile: {
              ...tweetAResp.profile,
              likesCounts: 1,
            },
          }),
        )

      cy.log('**unlike**')
      cy.gql({
        token,
        query: unlike,
        variables: {
          tweetId: tweetAResp.id,
        },
      })
      tweetLiked().should('eq', false)

      cy.log('**getLikes should be empty**')
      gqlGetLikes().should(
        spok({
          tweets: [],
        }),
      )
    })
  })

  after(() => {
    cy.cleanupTweet(tweetAResp.id, userAId)
    cy.cleanupUser(userAId)
  })
})
