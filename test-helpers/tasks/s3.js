const AWS = require('aws-sdk')

const deleteS3Item = signedUrl => {
  const S3BucketObjectKey = signedUrl
    .split('s3-accelerate.amazonaws.com/')[1]
    .split('?')[0]

  console.log({S3BucketObjectKey})
  console.log(process.env.BUCKET_NAME)

  const params = {
    Bucket: process.env.BUCKET_NAME,
    Delete: {
      Objects: [
        {
          Key: S3BucketObjectKey, // required
        },
      ],
    },
  }

  const s3 = new AWS.S3()
  return s3.deleteObject(params)

  // , function (err, data) {
  //   if (err) console.log(err, err.stack) // an error occurred
  //   else {
  // console.log(data) // successful response
  // expect(data).toEqual({
  //   Deleted: [
  //     {
  //       Key: S3BucketObjectKey,
  //     },
  //   ],
  //   Errors: [],
  // })
  //   }
  // })
}

module.exports = {deleteS3Item}
