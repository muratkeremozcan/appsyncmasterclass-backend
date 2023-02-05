// (9) bare bones http request
require('dotenv').config()
const http = require('axios')
const _ = require('lodash')
// [28] Refactor tests to use graphQL fragments
const fragments = {}
/** A helper to register the fragments
 * @param {string} name
 * @param {object} fragment
 * @returns {object}
 */
const registerFragment = (name, fragment) => (fragments[name] = fragment)

const throwOnErrors = ({query, variables, errors}) => {
  if (errors) {
    const errorMessage = `
query: ${query.substr(0, 100)}

variables: ${JSON.stringify(variables, null, 2)}

error: ${JSON.stringify(errors, null, 2)}
    `
    throw new Error(errorMessage)
  }
}

function* findUsedFragments(query, usedFragments = new Set()) {
  for (const name of Object.keys(fragments)) {
    if (query.includes(name) && !usedFragments.has(name)) {
      usedFragments.add(name)
      yield name

      const fragment = fragments[name]
      const nestedFragments = findUsedFragments(fragment, usedFragments)

      for (const nestedName of Array.from(nestedFragments)) {
        yield nestedName
      }
    }
  }
}

const graphQLQuery = async (auth, query, variables = {}) => {
  const headers = {}
  if (auth) {
    headers.Authorization = auth
  }

  // (28.0) find the fragments used in the query
  const usedFragments = Array.from(findUsedFragments(query)).map(
    name => fragments[name],
  )

  try {
    const resp = await http({
      method: 'post',
      url: process.env.API_URL,
      headers,
      data: {
        query: [query, ...usedFragments].join('\n'), // (28.1) include the fragments as part of the request we send to AppSync
        variables: JSON.stringify(variables),
      },
    })

    // the response from AppSync is an object with a data property
    // mind that axios returns resp.data
    const {data, errors} = resp.data
    throwOnErrors({query, variables, errors})
    return data
  } catch (err) {
    const errors = _.get(err, 'response.data.errors')
    throwOnErrors({query, variables, errors})
    throw err
  }
}

module.exports = {
  graphQLQuery,
  registerFragment,
}
