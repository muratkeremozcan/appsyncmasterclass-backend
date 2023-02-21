// (67.2) add the JS for the lambda function
const chance = require('chance').Chance()
const {initUsersIndex, initTweetsIndex} = require('../lib/algolia')
const {SearchModes} = require('../lib/constants')
const middy = require('@middy/core')
const ssm = require('@middy/ssm')

const {STAGE} = process.env

// (67.2) Use Middy SSM middleware to fetch the parameters and cache them.
// We use `setToContext` to add the env vars to the context object instead  of env vars
module.exports.handler = middy(async (event, context) => {
  // get the arguments and username/userId from the event
  const userId = event.identity.username
  const {query, mode, limit, nextToken} = event.arguments

  switch (mode) {
    case SearchModes.PEOPLE:
      return await searchPeople(context, userId, query, limit, nextToken)
    case SearchModes.LATEST:
      return await searchLatest(context, query, limit, nextToken)
    default:
      throw new Error(
        'Only "People" and "Latest" search modes are supported right now',
      )
  }
}).use(
  ssm({
    cache: true,
    cacheExpiryInMillis: 5 * 60 * 1000, // 5 mins
    names: {
      ALGOLIA_APP_ID: `/${STAGE}/algolia-app-id`,
      ALGOLIA_WRITE_KEY: `/${STAGE}/algolia-admin-key`,
    },
    setToContext: true,
    throwOnFailedCall: true,
  }),
)

async function searchPeople(context, userId, query, limit, nextToken) {
  // initialize the Algolia index
  const index = await initUsersIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  const searchParams = parseNextToken(nextToken) || {
    hitsPerPage: limit,
    page: 0,
  }

  const {hits, page, nbPages} = await index.search(query, searchParams)
  hits.forEach(x => {
    x.__typename = x.id === userId ? 'MyProfile' : 'OtherProfile'
  })

  // nextToken = null on last page
  // otherwise, nextToken = an opaque base64 string
  let nextSearchParams
  if (page + 1 >= nbPages) {
    nextSearchParams = null
  } else {
    nextSearchParams = Object.assign({}, searchParams, {page: page + 1})
  }

  // since we are talking to Algolia, we don't get the luxury of Appsync generating the next token,
  // so we do that ourselves
  return {
    results: hits,
    nextToken: genNextToken(nextSearchParams),
  }
}

async function searchLatest(context, query, limit, nextToken) {
  // initialize the Algolia index
  const index = await initTweetsIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  const searchParams = parseNextToken(nextToken) || {
    hitsPerPage: limit,
    page: 0,
  }

  const {hits, page, nbPages} = await index.search(query, searchParams)

  let nextSearchParams
  if (page + 1 >= nbPages) {
    nextSearchParams = null
  } else {
    nextSearchParams = Object.assign({}, searchParams, {page: page + 1})
  }

  return {
    results: hits,
    nextToken: genNextToken(nextSearchParams),
  }
}

function parseNextToken(nextToken) {
  if (!nextToken) {
    return undefined
  }

  const token = Buffer.from(nextToken, 'base64').toString()
  const searchParams = JSON.parse(token)
  delete searchParams.random

  return searchParams
}

function genNextToken(searchParams) {
  if (!searchParams) {
    return null
  }

  const payload = Object.assign({}, searchParams, {
    random: chance.string({length: 16}),
  })
  const token = JSON.stringify(payload)
  return Buffer.from(token).toString('base64')
}
