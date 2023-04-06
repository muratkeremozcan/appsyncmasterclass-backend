const {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
  tweetFragment,
  iTweetFragment,
  retweetFragment,
  replyFragment,
} = require('../../test-helpers/graphql-fragments')
// initially empty object that will be used to store the gql fragments
const fragments = {}
// each fragment is registered with a unique key, which is a string representing the name of the fragment
const registerFragment = (name, fragment) => (fragments[name] = fragment)
// populate the gql fragments, so we can access them from the fragments object
// later, these registered fragments are used to build GraphQL queries.
registerFragment('myProfileFields', myProfileFragment)
registerFragment('otherProfileFields', otherProfileFragment)
registerFragment('iProfileFields', iProfileFragment)
registerFragment('tweetFields', tweetFragment)
registerFragment('iTweetFields', iTweetFragment)
registerFragment('retweetFields', retweetFragment)
registerFragment('replyFields', replyFragment)
// When a query is constructed, the relevant fragments are retrieved from the fragments object
// using their registered keys.
// The retrieved fragments are then included in the query as needed (usedFragments).

console.log(registerFragment('replyFields', replyFragment))
console.table(fragments)

/** recursively searches for all the fragment names used in the given query and returns them as a generator
 * extracts the names of all the fragments used in a given GraphQL query and any nested fragments used within those fragments.*/
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

const gql = ({
  token,
  query,
  variables = {},
  url = Cypress.env('API_URL'),
} = {}) => {
  const headers = {}
  if (token) {
    headers.Authorization = token
  }

  // find the fragments used in the query
  const usedFragments = Array.from(findUsedFragments(query)).map(
    name => fragments[name],
  )

  return cy
    .api({
      method: 'POST',
      url,
      headers,
      body: {
        query: [query, ...usedFragments].join('\n'),
        variables: JSON.stringify(variables),
      },
    })
    .its('body.data')
}

export default gql
