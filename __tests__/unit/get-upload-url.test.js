require('dotenv').config()
const chance = require('chance').Chance()
const handler = require('../../functions/get-upload-url').handler
const {generateImageUploadEvent} = require('../../test-helpers/helpers')

describe('When getImageUploadUrl runs', () => {
  const variations = [
    ['.png', 'image/png'],
    ['.jpeg', 'image/jpeg'],
    ['.png', null],
    [null, 'image/png'],
    [null, null],
  ]
  it.each(variations)(
    'Returns a signed S3 url for extension %s and content type %s',
    async (extension, contentType) => {
      // create a mock event and feed it to the handler
      const username = chance.guid()
      // const extension = '.png' // we can make the input data-driven with variations
      // const contentType = 'image/png'
      const event = generateImageUploadEvent(username, extension, contentType)

      const result = new RegExp(
        `https://${
          process.env.BUCKET_NAME
        }.s3-accelerate.amazonaws.com/${username}/.*${
          extension || ''
        }?.*Content-Type=${
          contentType ? contentType.replace('/', '%2F') : 'image%2Fjpeg'
        }.*`,
      )

      // the handler creates a S3 signed url
      const signedUrl = await handler(event)

      expect(signedUrl).toMatch(result)
    },
  )
})
