import spok from 'cy-spok'
const {
  getTweets,
  tweet,
  getMyTimeline,
  like,
  unlike,
  getLikes,
  retweet,
  unretweet,
  reply,
} = require('../../test-helpers/queries-and-mutations')
const chance = require('chance').Chance()

describe('e2e test for tweet', () => {
  let token, tweetAResp, userAId, userBId, userBsReply, userBToken
  const text = chance.string({length: 16})

  before(() => {
    cy.task('signInUser').then(({username, accessToken}) => {
      userAId = username
      token = accessToken

      cy.gql({
        token,
        query: tweet,
        variables: {text},
      }).then(tResp => {
        tweetAResp = tResp
      })
    })

    cy.task('signInUser').then(({username, accessToken}) => {
      userBId = username
      userBToken = accessToken
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

  const gqlGetTweets = () =>
    cy.gql({
      token,
      query: getTweets,
      variables: {
        userId: userAId,
        limit: 25,
        nextToken: null,
      },
    })

  const tweetLiked = () => gqlGetTweets().its('tweets.0.liked')

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

  const gqlGetMyTimeline = () =>
    cy.gql({
      token,
      query: getMyTimeline,
      variables: {userId: userAId, limit: 25, nextToken: null},
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
    gqlGetTweets().should(
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
    gqlGetMyTimeline()
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

  // note: like + unlike and check is just one flow
  // in Jest , we want to make things easier to diagnose when they fail
  // that's why we use minimal it blocks and rely on hooks for test state
  // with Cypress we don't need any of that, we shape the it block per the flow

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

  it('[38] retweet: should see the retweet when calling getTweets', () => {
    cy.gql({
      token,
      query: retweet,
      variables: {
        tweetId: tweetAResp.id,
      },
    })

    gqlGetTweets()
      .its('tweets')
      .should('have.length', 2)
      .should(
        spok([
          {
            profile: {
              id: userAId,
              tweetsCount: 2,
            },
            retweetOf: {
              ...tweetAResp,
              retweets: 1,
              profile: {
                id: userAId,
                tweetsCount: 2,
              },
            },
          },
          {
            profile: {
              id: userAId,
              tweetsCount: 2,
            },
            retweets: 1,
          },
        ]),
      )
    cy.log('**should not see the retweet when calling getMyTimeline**')
    gqlGetMyTimeline().its('tweets').should('have.length', 1)

    cy.log('**[41] Should not see the retweet upon unRetweeting**')
    cy.gql({
      token,
      query: unretweet,
      variables: {
        tweetId: tweetAResp.id,
      },
    })

    gqlGetTweets()
      .its('tweets')
      .should('have.length', 1)
      .its('0')
      .should(
        spok({
          ...tweetAResp,
          retweets: 0,
          profile: {
            id: userAId,
            tweetsCount: 1,
          },
        }),
      )
  })

  it("[46] reply: userB replies to signedInUser's tweet", () => {
    cy.log('**userB should see the reply when calling getTweets**')
    cy.gql({
      token: userBToken,
      query: reply,
      variables: {
        tweetId: tweetAResp.id,
        text: chance.string({length: 16}),
      },
    }).then(replyResp => {
      userBsReply = replyResp
    })
    gqlGetTweets()
      .its('tweets.0')
      .should(
        spok({
          profile: {
            id: spok.string,
            tweetsCount: spok.number,
          },
        }),
      )

    cy.log('**userB should not see the reply when calling getMyTimeline**')
    cy.gql({
      token: userBToken,
      query: getMyTimeline,
      variables: {userId: userAId, limit: 25, nextToken: null},
    })
      .its('tweets.0')
      .should(
        spok({
          profile: {
            id: userBId,
            tweetsCount: 1,
          },
        }),
      )
  })

  after(() => {
    cy.cleanupTweet(tweetAResp.id, userAId)
    cy.cleanupUser(userAId)
    // need to clean userB's reply to userA's tweet
    cy.task('ddbDeleteTweet', userBsReply.id)
  })
})
