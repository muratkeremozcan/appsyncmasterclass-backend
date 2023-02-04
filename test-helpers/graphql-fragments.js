// [28] Refactor tests to use graphQL fragments

const myProfileFragment = `
fragment myProfileFields on MyProfile {
  id
  name
  screenName
  imageUrl
  backgroundImageUrl
  bio
  location
  website
  birthdate
  createdAt
  followersCount
  followingCount
  tweetsCount
  likesCounts  
}
`

const otherProfileFragment = `
fragment otherProfileFields on OtherProfile {
  id
  name
  screenName
  imageUrl
  backgroundImageUrl
  bio
  location
  website
  birthdate
  createdAt
  followersCount
  followingCount
  tweetsCount
  likesCounts
  following
  followedBy
}
`

const iProfileFragment = `
fragment iProfileFields on IProfile {
  ... on MyProfile {
    ... myProfileFields
  }

  ... on OtherProfile {
    ... otherProfileFields
  }
}
`

const getImageUploadUrl = `query getImageUploadUrl($extension: String, $contentType: String) {
  getImageUploadUrl(extension: $extension, contentType: $contentType)
}`

const tweetFragment = `
fragment tweetFields on Tweet {
  id
  profile {
    ... iProfileFields
  }
  createdAt
  text
  replies
  likes
  retweets
  retweeted
  liked
}
`

const retweetFragment = `
fragment retweetFields on Retweet {
  id
  profile {
    ... iProfileFields
  }
  createdAt
  retweetOf {
    ... on Tweet {
      ... tweetFields
    }

    ... on Reply {
      ... replyFields
    }
  }
}
`

const replyFragment = `
fragment replyFields on Reply {
  id
  profile {
    ... iProfileFields
  }
  createdAt
  text
  replies
  likes
  retweets
  retweeted
  liked
  inReplyToTweet {
    id
    profile {
      ... iProfileFields
    }
    createdAt
    ... on Tweet {
      replies
    }
    ... on Reply {
      replies
    }
  }
  inReplyToUsers {
    ... iProfileFields
  }
}
`

const iTweetFragment = `
fragment iTweetFields on ITweet {
  ... on Tweet {
    ... tweetFields
  }

  ... on Retweet {
    ... retweetFields
  }

  ... on Reply {
    ... replyFields
  }
}
`

module.exports = {
  myProfileFragment,
  otherProfileFragment,
  iProfileFragment,
  tweetFragment,
  iTweetFragment,
  retweetFragment,
  replyFragment,
  getImageUploadUrl,
}
