const TweetTypes = {
  TWEET: 'Tweet',
  RETWEET: 'Retweet',
  REPLY: 'Reply',
}

const SearchModes = {
  PEOPLE: 'People',
  LATEST: 'Latest',
}

const HashTagModes = {
  PEOPLE: 'People',
  LATEST: 'Latest',
}

const DynamoDB = {
  MAX_BATCH_SIZE: 25,
  MAX_BATCH_WRITE: 25,
}

module.exports = {
  TweetTypes,
  DynamoDB,
  SearchModes,
  HashTagModes,
}
