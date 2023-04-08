// the original s3 delete bucket kept giving circular reference error
// when wrapped in cy.task
// even working with json-cycle library, and applying it on the arguments didn't work
// decided to use another aws library for the task
const {S3Client, DeleteObjectCommand} = require('@aws-sdk/client-s3')

const deleteS3Item = signedUrl => {
  const S3BucketObjectKey = signedUrl
    .split('s3-accelerate.amazonaws.com/')[1]
    .split('?')[0]

  const input = {
    Bucket: process.env.BUCKET_NAME,
    Key: S3BucketObjectKey, // required
  }
  const client = new S3Client({region: process.env.AWS_REGION})

  const command = new DeleteObjectCommand(input)
  return client.send(command)
}

module.exports = {deleteS3Item}
