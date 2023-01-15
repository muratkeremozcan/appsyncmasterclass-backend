// (9) bare bones http request
const http = require('axios')
const _ = require('lodash')

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

const axiosGraphQLQuery = async (url, auth, query, variables = {}) => {
  const headers = {}
  if (auth) {
    headers.Authorization = auth
  }

  try {
    const resp = await http({
      method: 'post',
      url,
      headers,
      data: {
        query,
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
  axiosGraphQLQuery,
}
