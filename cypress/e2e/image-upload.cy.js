const {getImageUploadUrl} = require('../../test-helpers/graphql-fragments')
const path = require('path')
import {onlyOn} from '@cypress/skip-test'

onlyOn(
  Cypress.env('STAGE') === 'dev' || Cypress.env('STAGE') === 'stage',
  () => {
    describe('getUploadUrl and upload an image', () => {
      let token
      let id

      before(() => {
        cy.task('signInUser').then(({username, idToken}) => {
          id = username
          token = idToken
        })
      })

      it('should get an S3 url and upload an image', () => {
        const extension = '.jpeg'
        const contentType = 'image/jpeg'
        const urlRegex = new RegExp(
          `https://${Cypress.env(
            'BUCKET_NAME',
          )}.s3-accelerate.amazonaws.com/${id}/[a-zA-Z0-9_-]+.[a-zA-Z0-9]+`,
        )

        cy.log('**confirm that the signed url exists**')
        cy.gql({
          token,
          query: getImageUploadUrl,
          variable: {extension, contentType},
        })
          .its('getImageUploadUrl')
          .should('match', urlRegex)
          .then(signedUrl => {
            cy.log('**read the image**')
            cy.readFile(
              path.join(__dirname, '../../test-helpers/data/logo.jpeg'),
            ).then(fileToUpload => {
              cy.log('**upload the image**')
              cy.api({
                method: 'PUT',
                url: signedUrl,
                headers: {
                  'Content-Type': contentType,
                },
                body: fileToUpload,
              })
                .its('status')
                .should('eq', 200)

              cy.log('**download the image**')
              const downloadUrl = signedUrl.split('?')[0]
              cy.api({
                method: 'GET',
                url: downloadUrl,
              })
                .its('status')
                .should('eq', 200)
            })

            // cy.task('deleteS3Item', signedUrl)
            // Gleb says: You need to use a library to properly serialize objects with circular references for this to work.
            // rework it when and if there is a lesson
          })
      })

      after(() => {
        cy.task('ddbDeleteUser', id)

        cy.task('cognitoDeleteUser', id)
      })
    })
  },
)
