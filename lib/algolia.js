// (65.2) Create the lambda handlers for Algolia sync
const algoliasearch = require('algoliasearch')

// do not initialize the index on every lambda invocation
let usersIndex, tweetsIndex

const initUsersIndex = async (appId, key, stage) => {
  if (!usersIndex) {
    // on cold start initialize the index
    const client = algoliasearch(appId, key)
    usersIndex = client.initIndex(`users_${stage}`)
    // configure the index (just search by name and screenName)
    await usersIndex.setSettings({
      searchableAttributes: ['name', 'screenName', 'bio'],
    })
  }

  return usersIndex
}

const initTweetsIndex = async (appId, key, stage) => {
  if (!tweetsIndex) {
    const client = algoliasearch(appId, key)
    tweetsIndex = client.initIndex(`tweets_${stage}`)
    await tweetsIndex.setSettings({
      attributesForFaceting: ['hashTags'],
      searchableAttributes: ['text'],
      // return the most recent tweet on top in search results
      customRanking: ['desc(createdAt)'],
    })
  }

  return tweetsIndex
}

module.exports = {
  initUsersIndex,
  initTweetsIndex,
}
