// [16] e3e test image upload
// As a signed in user, make a graphQL request with the query `getImageUploadUrl`.
/// Upload an image to the S3 bucket.
// - Sign in.
// - Make a graphQL request with the query and variables to get a signed S3 URL.
// - Confirm that the upload url exists, and upload can happen.

require('dotenv').config()
const {signInUser} = require('../../test-helpers/cognito')
const {getImageUploadUrl} = require('../../test-helpers/graphql-fragments')
const AWS = require('aws-sdk')
const path = require('path')
const fs = require('fs')
const http = require('axios')
const {graphQLQuery} = require('../../test-helpers/graphql')

// does not work well with node 16
describe.skip('getUploadUrl and upload an image', () => {
  let signedInUser
  beforeAll(async () => {
    signedInUser = await signInUser()
  })

  it('should get an S3 url and upload an image', async () => {
    // as a signed in user, make a request to get a signed S3 URL
    // we can copy the query from the AppSync console,
    // here we are taking 2 inputs as a parameters, mirroring the type at schema.api.graphql
    // getImageUploadUrl(extension: String, contentType: String): AWSURL!

    // Make a graphQL request with the query and variables
    const extension = '.png'
    const contentType = 'image/png'
    const data = await graphQLQuery(
      signedInUser.accessToken,
      getImageUploadUrl,
      {extension, contentType},
    )
    const signedUrl = data.getImageUploadUrl
    console.log(`[${signedInUser.username}] - got image upload url`)

    const result = new RegExp(
      `https://${process.env.BUCKET_NAME}.s3-accelerate.amazonaws.com/${
        signedInUser.username
      }/.*${extension || ''}?.*Content-Type=${
        contentType ? contentType.replace('/', '%2F') : 'image%2Fjpeg'
      }.*`,
    )
    // confirm that the signed url exists
    expect(signedUrl).toMatch(result)

    // upload an image
    // get the file path of the logo.png file
    const filePath = path.join(__dirname, '../../test-helpers/data/logo.png')
    const fileToUpload = fs.readFileSync(filePath)
    // make a graphQL request to upload the image
    await http({
      method: 'PUT',
      url: signedUrl,
      headers: {
        'Content-Type': contentType,
      },
      data: fileToUpload,
    })
    console.log(`uploaded image to ${signedUrl}`)

    // download the image
    // const downloadUrl = signedUrl.split('?')[0]
    // await http({
    //   method: 'GET',
    //   url: downloadUrl,
    // })
    // console.log(`downloaded image to ${signedUrl}`)

    // might as well clean up the image
    const S3BucketObjectKey = signedUrl
      .split('s3-accelerate.amazonaws.com/')[1]
      .split('?')[0]
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
    s3.deleteObjects(params, function (err, data) {
      if (err) console.log(err, err.stack) // an error occurred
      else {
        console.log(data) // successful response
        expect(data).toEqual({
          Deleted: [
            {
              Key: S3BucketObjectKey,
            },
          ],
          Errors: [],
        })
      }
    })
  })

  afterAll(async () => {
    // clean up DynamoDB and Cognito
    const DynamoDB = new AWS.DynamoDB.DocumentClient()
    await DynamoDB.delete({
      TableName: process.env.USERS_TABLE,
      Key: {
        id: signedInUser.username,
      },
    }).promise()

    await signedInUser.cognito
      .adminDeleteUser({
        UserPoolId: signedInUser.userPoolId,
        Username: signedInUser.username,
      })
      .promise()
  })
})
