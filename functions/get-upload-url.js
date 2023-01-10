// (4.13.2) Implement the lambda function. We need to make a `putObject` request to S3.
const S3 = require('aws-sdk/clients/s3')
// when creating urls for the user to upload content, use S3 Transfer Acceleration
const s3 = new S3({useAccelerateEndpoint: true})
const ulid = require('ulid')
// (4.13.2.3) get the bucket env var (settings in serverless.yml file)
const {BUCKET_NAME} = process.env.BUCKET_NAME

const handler = async event => {
  // (4.13.2.1) construct the key for S3 putObject request
  // use ulid to create a randomized, but sorted id (chance is not sorted when we create multiple ids)
  const id = ulid.ulid()
  // construct a S3 key using the Construct a S3 key using the event.identity.username (got it from Lumigo)
  let key = `${event.identity.username}/${id}`
  // get the extension from graphQL schema : getImageUploadUrl(extension: String, contentType: String): AWSURL!
  const extension = event.arguments.extension
  // extension is optional, and we need to add a dot if there isn't one
  if (extension) {
    if (extension.startsWith('.')) {
      key += extension
    } else {
      key += `.${extension}`
    }
  }

  // (4.13.2.2) get the contentType from event.arguments.contentType
  // get the contentType from graphQL schema as well, it is optional as well so we give it a default value
  const contentType = event.arguments.contentType || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    throw new Error('contentType must start be an image')
  }

  // [4.13.2] use S3 to upload an image to S3. The operation is `putObject`
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    ACL: 'public-read',
    ContentType: contentType,
  }
  // note that s3.getSignedUrl is completely local, does not make a request to S3 (no need for a promise)
  return s3.getSignedUrl('putObject', params)
}

module.exports = {
  handler,
}
