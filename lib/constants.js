const TweetTypes = {
  TWEET: 'Tweet',
  RETWEET: 'Retweet',
  REPLY: 'Reply',
}

const DynamoDB = {
  MAX_BATCH_SIZE: 25,
  MAX_BATCH_WRITE: 25,
}

const SearchModes = {
  PEOPLE: 'People',
  LATEST: 'Latest',
}

module.exports = {
  TweetTypes,
  DynamoDB,
  SearchModes,
}
