# appsyncmasterclass-backend

In order to deploy, you need an AWS account and have to configure serverless.
After so, you may need to renew the authorization config periodically with the
CLI command. Once authorized, you deploy and can run e2e tests.

```bash
npm i

# configure credentials (needed for deploy and e2e tests)
npm run sls -- config credentials --provider aws --key <yourAWSAccessKeyId> --secret <AWSSecretKey> --overwrite

# deploy
npm run deploy

# export env vars to .env file
npm run export:env

# test (unit, integration and e2e)
npm t

# lint
npm run lint

# (fix) format
npm run format

# generate cloud formation template
npm run sls -- package
```

## 1 Setup backend project

Setup a GitHub repo.

`npm init -y`

`npm install --save-dev serverless/@v2.4.0` (because
`serverless-iam-roles-per-function` is broken after sls 2.4.0, remove carets).

Create a serverless project: `npm run sls -- create -t aws-nodejs`.

Install serverless-appsync-plugin: `npm i -D serverless-appsync-plugin`. It
allows to configure our AppSync api by adding a section to `serverless.yml` file
with:

```yml
custom:
  appSync:
```

Create a separate `serverless.appsync-api.yml` file for AppSync configuration.
Reference it in the main `serverless.yml` file with:

```yml
custom:
  appSync:
    - ${file(serverless.appsync-api.yml)}
```

In `serverless.yml`, exclude `package.json` files from being bundled.

```yml
package:
  exclude:
    - package-lock.json
    - package.json
```

Begin to configure the the file
[serverless.appsync-api.yml](./serverless.appsync-api.yml) (take a look).

## 2 Design the GraphQL schema

[2] Create the file [schema.api.gaphql](./schema.api.graphql). (Take a look at
the notes there).

It is very much like a TS file with types.

Identify and implement the schema; Queries, Mutations, types and interfaces that
will be used in the system.

Use interface to solidify the common properties between types (MyProfile vs
OtherProfile).

## 3 Configure Cognito User Pool

_(3.0)_ Before the GraphQL schema can be deployed, we need to create a AWS
Cognito User Pool and associate it with our AppSync API configuration. This is
done under `resources` section of [serverless.yml](./serverless.yml):

```yml
resources:
  Resources:
    CognitoUserPool:
```

(_3.1_) We need the CognitoUserPoolId of the CognitoUserPool as a cloud
formation output.

```yml
Outputs:
  CognitoUserPoolId:
    Value: !Ref CognitoUserPool
```

_(3.2)_ After configuring the Cognito User Pool, we need to configure the
AppSync API to use it ([schema.api.gaphql](./schema.api.graphql)).

```yml
name: appsyncmasterclass
schema: schema.api.graphql
# configure the AppSync API to use the cognito user pool
authenticationType: AMAZON_COGNITO_USER_POOLS
userPoolConfig:
  awsRegion: eu-west-1
  defaultAction: ALLOW
  userPoolId: !Ref CognitoUserPool
```

_(3.4)_ Now it is time to deploy. You need to have a AWSAccessKeyId and
AWSSecretKey to configure serverless framework to deploy.

```text
# rootkey.csv file
AWSAccessKeyId=*****
AWSSecretKey=***
```

There are a few ways to
[configure serverless with aws creds](https://www.serverless.com/framework/docs/providers/aws/guide/credentials#create-an-iam-user-and-access-key).
I used the below (mind that `--` passes args to the package.json script).

```bash
npm run sls -- config credentials \
  --provider aws \
  --key **** \
  --secret ***
```

> When testing integration or e2e, if you get a nonsense Jest timeout 5000 ms
> error, the credentials must have expired. You have to renew them to get the
> tests passing. The clue is when having to `npm run deploy` and that does not
> succeed.

Then deploy with `npm run deploy`. In _AWS console / Cognito_ we find
`appsyncmasterclass` as defined in
[serverless.appsync-api.yml](./serverless.appsync-api.yml)

_(3.5)_ We need to be logged in with Cognito to test AppSync queries. Create a
cognito user by hand at _CognitoUserPool / Users and Groups_. (I used my email).

We also need to configure a application client at _CognitoUserPool / App
clients_ to be able to interact with the Cognito User Pool. We do this by adding
a resource to [serverless.yml](./serverless.yml) (as opposed to doing it by hand
at AWS Console):

```yml
resources:
  Resources:
    CognitoUserPool: ##
    WebUserPoolClient:
```

_(3.6)_ At AWS AppSync, _Login via Cognito User Pools_ and test out some
queries.

## 4 Save user profile on `PostConfirmation`

- Capture the new user that gets created in Cognito.

- Save the user in a DynamoDB table:
  - (use a lambda trigger at _CognitoUserPool / Triggers_). After a user is
    confirmed, send a message to a lambda function, and that function can save
    the user in the DynamoDB table.
- That will allow us to use AppSync query and mutations

_(4.0)_ Create a DynamoDB table to store user profiles

```yml
resources:
  Resources:
    UsersTable:
    CognitoUserPool: ##
    WebUserPoolClient: ##
```

> Convention: _(4.0.1)_ Environment is dev, unless we pass in a stage override
> with `npm run sls -- -s prod`
>
> ```yml
> custom:
>   # Environment is dev, unless we pass in a stage override
>   stage: ${opt:stage, self:provider.stage}
>   appSync:
>     - ${file(serverless.appsync-api.yml)}
> ```

_(4.1)_ Add a functions block for the lambda trigger function

The function needs to know the name of the UsersTable, which is generated by
CloudFormation.

_(4.2)_ Install `npm i -D serverless-iam-roles-per-function` , which allows
custom permissions per function. The function needs the permission to write to
the UsersTable. We do not want a global `iamRoleStatements:` under `provider:` ,
we just want permission for this function. We use
`npm i -D serverless-iam-roles-per-function` to do this.

```yml
confirmUserSignup:
  handler: functions/confirm-user-signup.handler
  # name of the UsersTable fn is accessing
  environment:
    USERS_TABLE: !Ref UsersTable
  # custom permission for the function
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:PutItem
      Resource: !GetAtt UsersTable.Arn
```

_(4.3)_ Configure Cognito to call the above lambda trigger function when a new
user is registered. We can't use the lambda function's name, because that's
something local to serverless framework. Instead we figure out the logical id
sls generates for the lambda function, by using `npm run sls -- package`. Which
generates cloudformation template under .serverless folder. There look for
`ConfirmUserSignupLambdaFunction`

```yml
CognitoUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    LambdaConfig:
    PostConfirmation: !GetAtt ConfirmUserSignupLambdaFunction
```

_(4.4)_ We also need to give Cognito additional permissions to call the lambda
function, by default it doesn't have any. The below grants CognitoUserPool the
lambda:invokeFunction permission for ConfirmUserSignupLambdaFunction.

```yml
UserPoolInvokeConfirmUserSignupLambdaPermission:
  Type: AWS::Lambda::Permission
  Properties:
    Action: lambda:invokeFunction
    FunctionName: !Ref ConfirmUserSignupLambdaFunction
    Principal: cognito-idp.amazonaws.com
    SourceArn: !GetAtt CognitoUserPool.Arn
```

_(4.5)_ Now we add the lambda function
[./functions/confirm-user-signup.js](./functions/confirm-user-signup.js)

## 5 Testing overview

With serverless apps, unit tests do not give enough confidence for the cost.
Same cost & little value vs integration tests. Apply the test honeycomb, prefer
integration tests over unit tests, and some e2e. All because many things can go
wrong, none of which are related to our lambda code.

Unit test covers the business
logic.![unit-test](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ckgcm75wpg1ezpk5cqpr.png)

Integration is the same cost, and more value than unit. Covers the business
logic + DynamoDB
interaction.![integration-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/irn19obybd4dfs9bni74.png)There
are things integration tests cannot cover, but they are still a good bang for
the
buck.![integration](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/gtkxvl1yh7fqwahptxfa.png)

E2e can cover everything, highest confidence but also costly. We need
some.![e2e-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1vtufpqa62fdgprlqt6c.png)

![e2e](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qjra5fzp7yr31r06dfzd.png)

Prop-tips from Yan:

- Avoid local simulation (e.g. LocalStack), they’re more work than is worth it,
  and hides common failure modes such as misconfigured permissions and resource
  policies.
- In integration tests, only use mocks for AWS services to simulate
  hard-to-reproduce **failure cases**. If it's happy path, do not mock AWS. You
  can mock your internal services/APIs.
- Use temporary stacks for feature branches to avoid destabilizing shared
  environments, and during CI/CD pipeline to run end-to-end tests to remove the
  overhead of cleaning up test data.
  https://theburningmonk.com/2019/09/why-you-should-use-temporary-stacks-when-you-do-serverless/

### 6 Integration testing `confirm-user-signup`

The pattern is as follows:

- Create an event: an object which includes user info.
- Feed it to the handler (the handler causes a write to DDB, hence the
  "integration")
- Check that the result matches the expectation (by reading from DDB, hence
  "integration")

Use the `serverless-export-env` plugin to create a `.env` file with our env
vars. It picks up a few values from `serverless.yml`.

```bash
npm i -D jest @types/jest dotenv

# add it as a plugin to serverless.yml
# later version does not download COGNITO_USER_POOL_ID USERS_TABLE
npm i -D serverless-export-env@v1.4.0
npm run sls -- export-env
```

Add AWS_REGION and USER_POOL_ID to Outputs, so that they can also be acquired
via the plugin. Use the `${self:custom.*}` trick for AWS_REGION, because we
cannot use it as lambda function level since that is specific to sls.

```yml
# serverless.yml
provider:
  environment:
    STAGE: # picks up
    AWS_NODEJS_CONNECTION_REUSE_ENABLED: # picks up

custom:
  # (6) add AWS_REGION as an env var (use region from CLI command override, otherwise provider:region:)
  region: ${opt:region, self:provider.region}
  stage: ${opt:stage, self:provider.stage}
  appSync: ${file(serverless.appsync-api.yml)}

functions:
  confirmUserSignup:
    handler: #
    environment:
      USERS_TABLE: # picks up

  Outputs:
    CognitoUserPoolId: # picks it up as an env var too
      Value: !Ref CognitoUserPool
    # add AWS_REGION as an env var
    AwsRegion:
      Value: ${self:custom.region}
```

After the `serversless.yml` change, we have to deploy and run
`npm run sls -- export-env` again. Finally, we have an `.env` file with 5
values:

```dotenv
# .env
STAGE=dev
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
COGNITO_USER_POOL_ID=eu-west-1_***
AWS_REGION=eu-west-1
USERS_TABLE=appsyncmasterclass-backend-dev-UsersTable-***
```

Take a look at
[./**tests**/confirm-user-signup-integration.test.js](./__tests__/confirm-user-signup-integration.test.js).

### 7 E2e test `confirm-user-signup`

In the test there are 3 main things we do:

- We create a user from scratch using `AWS.CognitoIdentityServiceProvider`
  (cognito).
- We are not using a real email, so we use `cognito.adminConfirmSignup` to
  simulate the user sign up verification.
- As a result we should see a DynamoDB table entry, confirm it.

In order to work with cognito and simulate a user signup, we need
`WebUserPoolClient` id. We capture that as an output in the `serverless.yml `
`Outputs` section, similar to what we did to acquire _COGNITO_USER_POOL_ID
(3.1)_.

```yml
Outputs:
	# lets us use process.env.COGNITO_USER_POOL_ID
  CognitoUserPoolId:
    Value: !Ref CognitoUserPool
  # lets us use process.env.WEB_COGNITO_USER_POOL_CLIENT_ID
  WebUserPoolClientId:
    Value: !Ref WebUserPoolClient
```

After the `serversless.yml` change, we have to deploy `npm run deploy` and
export environment `npm run export:env`. Finally, we have an `.env` file with 6
values:

```dotenv
# .env
STAGE=dev
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
COGNITO_USER_POOL_ID=eu-west-1_***
WEB_COGNITO_USER_POOL_CLIENT_ID=******
AWS_REGION=eu-west-1
USERS_TABLE=appsyncmasterclass-backend-dev-UsersTable-***
```

Take a look at
[./**tests**/confirm-user-signup-e2e.test.js](./__tests__/confirm-user-signup-e2e.test.js).

## 8 Implement `getMyProfile` query (_setup an AppSync resolver and have it get an item from DDB_)

After the user is signed up and confirmed, we can get the data from DynamoDB,
similar to what we did in the integration and e2e tests.

We need to setup an AppSync resolver and have it get an item from DDB.

_(8.1)_ Tell the serverless AppSync plugin where the Appsync templates are going
to be, and how to map them to the graphQL query.

```yml
# serverless.appsync-api.yml
mappingTemplatesLocation: mapping-templates
mappingTemplates:
  - type: Query
    field: getMyProfile
    dataSource: usersTable # we define dataSources below for this
dataSources:
  - type: NONE
    name: none
  - type: AMAZON_DYNAMODB
    name: usersTable
    config:
      tableName: !Ref UsersTable
```

> What is VTL, and why do we use it?
>
> VTL is the template language that you can use with all AppSync integrations, including Lambda. 
>
> We need something to tell AppSync how to make a request to the thing it's integrating with, be it a DynamoDB table, a Lambda function, an HTTP endpoint or something else. We need to tell AppSync how to transform the response because it's probably not in the right shape that the resolver needs to return.
>
> * With Lambda, AppSync provides a default request & response template so you don't have to write one.
> * For pipeline functions, you can now also use JavaScript to create the request and response templates instead of VTL, see https://aws.amazon.com/blogs/aws/aws-appsync-graphql-apis-supports-javascript-resolvers. But the JavaScript support is only limited to pipeline functions right now, and in most cases, you probably don't need a pipeline function if your resolver just needs to do one thing.

_(8.2)_ Per convention, add two files at the folder `./mapping-templates`;
`Query.getMyProfile.request.vtl`, `Query.getMyProfile.response.vtl` . Realize
how it matches `mappingTemplates:type&field`. Use the info in these two AWS docs
to configure the `vtl` files [1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html), [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html):

- Take the identity of the user (available in `$context.identity`), take the
  username and turn it into a DDB structure.

```vtl
// mapping-templates/Query.getMyProfile.request.vtl
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.identity.username)
  }
}
```

- For the response, turn it into json. The response is captured by AppSync into
  `$context.result`

```vtl
// mapping-templates/Query.getMyProfile.response.vtl
$util.toJson($context.result)
```

Deploy with `npm run deploy`. Verify that changes worked by looking for the
string `GraphQlResolverQuerygetMyProfile` under the templates in `.serverless`
folder

_(8.3)_ To test at the AWS console, we need a new Cognito user similar to the
ones created in the integration and e2e tests before. We do not have access to
those, so we use AWS CLI to create a cognito user.

`aws cognito-idp --region eu-west-1 sign-up --client-id <yourEnvVarForWebCognitoUserPoolClientId> --username <yourEmail> --password <yourPw> --user-attributes Name=name,Value=<yourName>`

Once the command goes through, we should have an unconfirmed user in the Cognito
console. Confirm the user here, it will populate in DDB - make sure you never
delete it or you have to do the steps again. Go to AppSync and sign in with the
user. Create a query for `getMyProfile` and we should see results.

![AppSyncQuery](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7qxfzx1880j0670i33j5.png)

Try asking for the tweets field. There is no resolver associated with it, so
AppSync will return a null.

### 8 Unit test `getMyProfile` query

We are going to test that `Query.getMyProfile.request.vtl` executes the template
with `$context.identity.username` and turn it into a DDB json structure.

- Create an AppSync context that contains the username (for
  `$context.identity.username`).
- Get the template (file `Query.getMyProfile.request.vtl`).
- Render the template (using the utility npm packages).

`npm i -D amplify-velocity-template amplify-appsync-simulator` will help with
generating the AppSync context and rendering the `.vtl` template.

Check out `__tests__/unit/Query.getMyProfile.request.test.js`.

> Yan does not recommend to unit test the VTL template, because it
> straightforward, and in real life things do not go wrong there. In most cases
> we use AppSync to talk to DDB, and we are taking one of the examples from
> resolver mapping references
> ([1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),
> [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html)).
> Therefore , instead of unit, he recommends to focus on testing e2e.

### 9 & 10 E2e test `getMyProfile` query

As a signed in user, make a graphQL request with the query `getMyProfile`.

- Sign in
- Make a graphQL request with the query
- Confirm that the returned profile is in the shape of the query.

Check out `__tests__/e2e/user-profile.test.js`.

### Getting the GraphQL API_URL

A crude way to get the GraphQLApiUrl is through the web console:
`CloudFormation/Stacks/appsyncmasterclass-backend-dev` > Outputs.

`serverless-export-env` looks at the `Outputs` property of the `serverless.yml`,
it cannot acquire `.Arn` from our AWS stack(comes as [Object object])

```yml
  Outputs:
		ConitoUserPoolArn:
		  # Getting the .Arn will not work
		  Value : !Ref CognitoUserPool.Arn

    CognitoUserPoolId:
      Value: !Ref CognitoUserPool

    WebCognitoUserPoolClientId:
      Value: !Ref WebUserPoolClient

    AwsRegion:
      Value: ${self:custom.region}
```

[10] To get the GraphQL API_URL from `CognitoUserPoolArn` we can use
`npm i -D serverless-manifest-plugin`. Run the command
`npm run sls -- manifest`. As opposed to looking at `serverless.yml`'s `Output`,
it looks at the CloudFormation stack that has been deployed. It outputs a
succinct json at `./.serverless/manifest.json`. We could also get the value from
there, but that's not automated.

Under `serverless.yml / custom` create a manifest section:

```yml
custom:
  ##
  manifest:
    postProcess: ./processManifest.js
    disablePostDeployGeneration: true
    disableOutput: true
    silent: true
```

Create the file `./processManifest.js`. This script is analyzes the
`manifest.json` file, looks for `outputs/OutpuKey/GraphQlApiUrl` and puts it
into the `.env` file.

```js
const _ = require('lodash')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')
const {promisify} = require('util')

module.exports = async function processManifest(manifestData) {
  const stageName = Object.keys(manifestData)
  const {outputs} = manifestData[stageName]

  const getOutputValue = key => {
    console.log(`loading output value for [${key}]`)
    const output = _.find(outputs, x => x.OutputKey === key)
    if (!output) {
      throw new Error(`No output found for ${key}`)
    }
    return output.OutputValue
  }

  const dotEnvFile = path.resolve('.env')
  await updateDotEnv(dotEnvFile, {
    API_URL: getOutputValue('GraphQlApiUrl'),
  })
}

/* Utils, typically this would be a package includes from NPM */
async function updateDotEnv(filePath, env) {
  // Merge with existing values
  try {
    const existing = dotenv.parse(
      await promisify(fs.readFile)(filePath, 'utf-8'),
    )
    env = Object.assign(existing, env)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }

  const contents = Object.keys(env)
    .map(key => format(key, env[key]))
    .join('\n')
  await promisify(fs.writeFile)(filePath, contents)

  return env
}

function escapeNewlines(str) {
  return str.replace(/\n/g, '\\n')
}

function format(key, value) {
  return `${key}=${escapeNewlines(value)}`
}
```

Modify the `package.json` script to also include `sls manifest`

` export:env": "sls export-env && sls manifest",`

Run the command `npm run export:env`. `API_URL=******` should get generated

```
STAGE=dev
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
COGNITO_USER_POOL_ID=eu-west-1_***
WEB_COGNITO_USER_POOL_CLIENT_ID=******
AWS_REGION=eu-west-1
USERS_TABLE=appsyncmasterclass-backend-dev-UsersTable-***
API_URL=******
```

> Make sure to clean up
> [DDB](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#item-explorer?initialTagKey=&table=appsyncmasterclass-backend-dev-UsersTable-YMVROSIOQDW5)
> and
> [CognitoUserPool](https://eu-west-1.console.aws.amazon.com/cognito/users/?region=eu-west-1#/pool/eu-west-1_LYIK8FuXA/users?_k=zqpvnh)
> at the end of the e2e test, do not delete your user which is used in AppSync
> console tests.

## 12 Implement `editMyProfile` mutation (_setup an AppSync resolver and have it edit an item at DDB._)

_(12.0)_ Add an entry to the mapping templates

```yml
# ./serverless.appsync-api.yml
mappingTemplates:
  - type: Query
    field: getMyProfile
    dataSource: usersTable

  - type: Mutation
    field: editMyProfile
    dataSource: usersTable
```

_(12.1)_ We are going to write a resolver that updates the DDB usersTable. Add
the two files under `mapping-templates` folder
`Mutation.editMyProfile.request.vtl` and `Mutation.editMyProfile.response.vtl`.
Take a look at PutItem reference from AWS AppSync docs
([1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html)).
For `key:id` we use the `$util` as we did in the `getMyProfile` query. For
`attributeValues` be careful not to use
[dynamo db reserved words](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html),
and if so, use an expressionNames; `name` -> `#name`, `location` -> `#location`.

Replicate the fields from `schema.api.graphql` into `expression` and
`expressionValues`, they will all be `$context.arguments.newProfile` because of
our GraphQL schema that was defined. Add a `condition`
`"expression" : "attribute_exists(id)"`, so if the user's id does not exist, the
operation fails.

```graphql
# ./schema.api.graphql
type Mutation {
  editMyProfile(newProfile: ProfileInput!): MyProfile!
  ...
}

input ProfileInput {
  name: String!
  imageUrl: AWSURL
  backgroundImageUrl: AWSURL
  bio: String
  location: String
  website: AWSURL
  birthdate: AWSDate
}
```

```
# mapping-templates/Mutation.editMyProfile.request.vtl
{
  "version" : "2018-05-29",
  "operation" : "UpdateItem",
  "key": {
    "id" : $util.dynamodb.toDynamoDBJson($context.identity.username)
  },
  "update" : {
    "expression" : "set #name = :name, imageUrl = :imageUrl, backgroundImageUrl = :backgroundImageUrl, bio = :bio, #location = :location, website = :website, birthdate = :birthdate",
    "expressionNames" : {
      "#name" : "name",
      "#location" : "location"
    },
    "expressionValues" : {
      ":name" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.name),
      ":imageUrl" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.imageUrl),
      ":backgroundImageUrl" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.backgroundImageUrl),
      ":bio" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.bio),
      ":location" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.location),
      ":website" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.website),
      ":birthdate" : $util.dynamodb.toDynamoDBJson($context.arguments.newProfile.birthdate)
    }
  },
  "condition" : {
    "expression" : "attribute_exists(id)"
  }
}
```

`editMyProfile.response` is the same as `getMyProfile.response`

```
# ./mapping-templates/Mutation.editMyProfile.response.vtl
$util.toJson($context.result)
```

Deploy and test at AppSync web console. If getQuery is broken, you may have
moved `chance` package to devDependencies. If Put is broken, you may have
deleted the user from DDB, and you have to re-create it as in section 4.8 using
`aws cognito-idp `.

![UpdateItem](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/mp550m5vmaatz9mk0t0h.png)

### 13 Unit test `editMyProfile`

We are going to test that `Mutation.editMyProfile.request.vtl` executes the
template with `$context.identity.username` and turns it into a DDB json
structure.

- Create an AppSync context that contains the username (for
  `$context.identity.username`). KEY: when generating the context we need to
  give it an argument (`editMyProfile(newProfile: ProfileInput!): MyProfile!`).
- Get the template (file `Mutation.editMyProfile.request.vtl`).
- Render the template (using the utility npm packages).

Check out `__tests__/unit/Mutation.editMyProfile.request.test.js`.

> Yan does not recommend to unit test the VTL template, because it
> straightforward, and in real life things do not go wrong there. In most cases
> we use AppSync to talk to DDB, and we are taking one of the examples from
> resolver mapping references
> ([1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),
> [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html)).
> Therefore , instead of unit, he recommends to focus on testing e2e.

### 14 E2e test `editMyProfile

As a signed in user, make a graphQL request with the query `editMyProfile`.

- Sign in
- Make a graphQL request with the query and variable
- Confirm that the returned profile has been edited

Check out `__tests__/e2e/user-profile.test.js`.

For the types, there are 3 key pieces of info:

- `editMyProfile` takes `newProfile` as an argument

```
# schema.api.graphql
type Mutation {
  editMyProfile(newProfile: ProfileInput!): MyProfile!
```

- At the AppSync web console we build an example

```
mutation MyMutation {
  editMyProfile(newProfile: {name: "Murat Ozcan"}) {
    id
    name
    screenName
    birthdate
    createdAt
    backgroundImageUrl
    bio
  }
}
```

- In the test, we can take an input as a parameter

```javascript
const editMyProfile = `mutation editMyProfile($input: ProfileInput!) {
	editMyProfile(newProfile: $input) {
```

And the input can be just `input: {name: newName}`.

## 15 Implement getImageUploadUrl query (_use a lambda to upload a file to S3_)

_(15.0)_ Add an entry to the mapping templates, and a dataSource. For lambda
functions, Appsync has a direct resolver integration, so we do not need a custom
request & response vtl template. Set request and response to false and
`serverless-appsync-plugin` takes care of it. When dealing with DDB, we could
leave them out because we specified the vtl files under `./mapping-templates`
and the plugin took care of it.

```yml
# ./serverless.appsync-api.yml

mappingTemplates:
  - type: Query
    field: getMyProfile
    dataSource: usersTable

  - type: Mutation
    field: editMyProfile
    dataSource: usersTable

  # [15] Implement getImageUploadUrl query (use a lambda to upload a file to S3)
  - type: Query
    field: getImageUploadUrl
    dataSource: getImageUploadUrlFunction # we define dataSources below for this
    # For lambda functions, Appsync has a direct resolver integration,
    # so we do not need a custom request & response vtl template.
    # this is how we configure it, and serverless-appsync-plugin takes care of it
    request: false
    response: false

dataSources:
  - type: NONE
    name: none
  - type: AMAZON_DYNAMODB # (8.1, 12.0)
    name: usersTable
    config:
      tableName: !Ref UsersTable
  - type: AWS_LAMBDA # (15.0)
    name: getImageUploadUrlFunction
    config:
      functionName: getImageUploadUrl
```

_(15.1)_ add the lambda function that will do the work (getImageUploadUrl)

```yml
# ./serverless.yml

functions:
  confirmUserSignup: ##

  getImageUploadUrl:
    handler: functions/get-upload-url.handler
```

Run `npm run sls --package` to test that it works so far.

### _(15.2)_ Implement the lambda function `functions/get-upload-url.js`.

We need to make a `putObject` request to S3. From the graphQL schema
`getImageUploadUrl(extension: String, contentType: String)` , we know that we
need an extension and contentType as args, both of which are optional. We can
get them from `event.arguments`. For S3 `putObject` we need `key`, `contentType`
and the bucket env var.

_(14.2.1)_ To construct the `key` for S3, we can use `event.identity.username`
(Lumigo screenshot)

![construct-s3-key](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/v9m1cqkpuwuo9gck2u55.png)

_(15.2.2)_ To get the `contentType` we use `event.arguments.contentType `.

_(15.2.3)_ create the S3 bucket env var, to help make the s3 putObject request.

For the bucket env var, we have to add an entry to `serverless.yml` `resources`
section:

```yml
# ./serverless.yml
functions:
  confirmUserSignup: #

  getImageUploadUrl:
    handler: functions/getImageUploadUrl.handler
    environment: # (14.2)
      BUCKET_NAME: !Ref AssetsBucket
    iamRoleStatements:
      - Effect: Allow
        Action:
          - s3:PutObject # the lambda needs the S3 putObject permission
          # it also needs ACL permission because we set it in the params
          # get-upload-url.js/s3.getSignedUrl('putObject', params)
          - s3:PutObjectAcl
        # allow the function to interact with any object in the bucket
        Resource: !Sub ${AssetsBucket.Arn}/*

resources:
  Resources:
    UsersTable: #
    CognitoUserPool: #
    UserPoolInvokeConfirmUserSignupLambdaPermission: #
    WeUserPoolClient: #

    # (13.2) acquire the S3 bucket env var, to help make the s3 putObject request
    AssetsBucket:
      Type: AWS::S3::Bucket
      Properties:
        AccelerateConfiguration:
          # because we used: const s3 = new S3({useAccelerateEndpoint: true})
          AccelerationStatus: Enabled
        CorsConfiguration: # because the UI client needs to make a request
          CorsRules:
            - AllowedMethods:
                - GET
                - PUT
              AllowedOrigins:
                - '*'
              AllowedHeaders:
                - '*'
```

Other notes:

- When creating urls for the user to upload content, use S3 Transfer
  Acceleration.

- `npm i -D ulid`, and use `ulid` to create a randomized, but sorted ids.
  Problem with `chance` is the random ids are not sortable, ulid generates
  sortable keys.
- If we need to customize the file upload (ex: file size limit) we can use
  `s3.createPresignedPost` instead of `s3.getSignedUrl`. Check out Zac Charles'
  post on S3 presigned URLs vs presigned POSTs
  [here](https://medium.com/@zaccharles/s3-uploads-proxies-vs-presigned-urls-vs-presigned-posts-9661e2b37932),
  and the
  [official AWS documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html)
  on creating POST policies (including a list of conditions you can apply).

```js
// ./functions/get-upload-url.js

// [14.2] Implement the lambda function. We need to make a `putObject` request to S3.
// We need to make a `putObject` request to S3.
// From the graphQL schema `getImageUploadUrl(extension: String, contentType: String)` ,
/// we know that we need an extension and contentType as args, both of which are optional.
/// We can get them from `event.arguments`.
// For S3 `putObject` we need `key`, `contentType` and the bucket env var.
const S3 = require('aws-sdk/clients/s3')
// when creating urls for the user to upload content, use S3 Transfer Acceleration
const s3 = new S3({useAccelerateEndpoint: true})
const ulid = require('ulid')

const handler = async event => {
  // (14.2.1) construct the key for S3 putObject request
  // use ulid to create a randomized, but sorted id (chance is not sorted when we create multiple ids)
  const id = ulid.ulid()
  // construct a S3 key using the event.identity.username (got it from Lumigo)
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

  // (14.2.2) get the contentType from event.arguments.contentType
  // get the contentType from graphQL schema as well, it is optional so we give it a default value
  const contentType = event.arguments.contentType || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    throw new Error('contentType must start be an image')
  }

  // [14.2] use S3 to upload an image to S3. The operation is `putObject`
  const params = {
    Bucket: process.env.BUCKET_NAME, // (14.2.3) get the bucket env var (settings in serverless.yml file)
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
```

`npm run deploy` and `npm run export:env` to see the `BUCKET_NAME` populate in
the `.env` file.

### 15 Unit test `getImageUploadUrl`

Similar to section 4.6 `confirm-user-signup-integration.test.js`, we need to:

- Create a mock event (an object)
- Feed it to the handler
- Check that the result matches the expectation (the handler creates a certain
  S3 url)

Since there is no DDB interaction as in 4.6, or any interaction with the S3
bucket, this one is a unit test.

Check out `__tests__/unit/get-upload-url.test.js`.

### 16 E2e test `getImageUploadUrl`

As a signed in user, make a graphQL request with the query `getImageUploadUrl`.
Upload an image to the S3 bucket.

- Sign in.
- Make a graphQL request with the query and variables to get a signed S3 URL.
- Confirm that the upload url exists, and upload can happen.

Check out `__tests__/e2e/image-upload.test.js`.

For the types, there are 3 key pieces of info:

- `getImageUploadUrl` takes `extension` and `contentType` as arguments:

```
# schema.api.graphql
type Query {
  getImageUploadUrl(extension: String, contentType: String): AWSURL!
```

- At the AppSync web console we build an example

```
query MyQuery {
  getImageUploadUrl(extension: ".png", contentType: "image/png")
}
```

- In the test, we can take the 2 inputs as a parameters

```javascript
const getImageUploadUrl = `query getImageUploadUrl($extension: String, $contentType: String) {
      getImageUploadUrl(extension: $extension, contentType: $contentType)
    }`
```

## 17 Implement tweet mutation

_(17.0)_ Create a DDB table to store tweets; `TweetsTable`.

```yml
# serverless.yml

resources:
  Resources:
    UsersTable: #
    TweetsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
            # to fetch the tweets for a particular user,
            # we also need the DDB partition key
          - AttributeName: creator
            AttributeType: S
        GlobalSecondaryIndexes:
          - IndexName: byCreator
            KeySchema:
              - AttributeName: creator # hash key
                KeyType: HASH
              - AttributeName: id # range/sort key
                KeyType: RANGE
            Projection:
              # so that when we get the tweets, we get all items
              ProjectionType: ALL
        Tags: # so that we can track the cost in AWS billing
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: tweets-table
```

_(17.1)_ Create a DDB table to store tweet timelines; `TimelinesTable`

```yml
#serverless.yml

resources:
  Resources:
    UsersTable: #
    TweetsTable: #
    TimelinesTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: userId # partition key
            KeyType: HASH
          - AttributeName: tweetId # sort key
            KeyType: RANGE
        AttributeDefinitions:
          - AttributeName: userId
            AttributeType: S
          - AttributeName: tweetId
            AttributeType: S
        Tags: # so that we can track the cost in AWS billing
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: timelines-table
```

When we create a new tweet, it gets written to the `TweetsTable` and
`TimelinesTable`. We also have to update `tweetsCount` for user profile page
(part of the `IProfile` from graphQL schema), which we track in `UsersTable`.
Having to transact with 3 tables, we could do these 3 operations in one DDB
transaction. However, what we cannot do in a DDB resolver is we cannot generate
the `ulid`s for the tweets, and for that we need to use a lambda resolver
instead.

_(17.2)_ Create a lambda resolver to generate a tweet `ulid`, write to `TweetsTable`, `TimelinesTable` and update `UsersTable`.

_(17.2.0)_ Add the mapping template to `mappingTemplates`, we need resolvers when we are transacting with DDB. We want AppSync to invoke the lambda function directly without going through a custom mapping template.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  
	- type: Mutation
    field: retweet
    dataSource: retweetFunction
    request: false
    response: false
```

```yml
# ./serverless.appsync-api.yml

mappingTemplates:

  - type: Query
    field: getMyProfile
    dataSource: usersTable

  - type: Mutation
    field: editMyProfile
    dataSource: usersTable

  - type: Query
    field: getImageUploadUrl
    dataSource: getImageUploadUrlFunction
    request: false
    response: false

   # (17.2) Create a lambda resolver to generate a tweet `ulid`,
   #  write to TweetsTable, TimelinesTable and update `UsersTable`.
   # (17.2.0) Add the  mapping template
  - type: Mutation
    field: tweet
    dataSource: tweetFunction
    request: false
    response: false

 dataSources:
  - type: NONE
    name: none
  - type: AMAZON_DYNAMODB # (8.1, .12.0)
    name: usersTable
    config:
      tableName: !Ref UsersTable
  - type: AWS_LAMBDA # (15.0)
    name: getImageUploadUrlFunction
    config:
      functionName: getImageUploadUrl
  - type: AWS_LAMBDA # (17.2.0)
    name: tweetFunction
    config:
      functionName: tweet
```

_(17.2.1)_ add the yml for the lambda function that will generate a tweet `ulid`
for the 3 DDB tables, write to Tweets and Timelines tables, and update Users
table.

```yml
# serverless.yml
functions:
  confirmUserSignup: #
  getImageUploadUrl: #
  tweet:
    handler: functions/tweet.handler
    environment: # we need to transact with 3 DDB tables
      USERS_TABLE: !Ref UsersTable
      TWEETS_TABLE: !Ref TweetsTable
      TIMELINES_TABLE: !Ref TimelinesTable
    iamRoleStatements:
      # in DDB, Put means rest POST, and Update means rest PUT
      - Effect: Allow # we need to update the tweet count at UsersTable
        Action: dynamodb:UpdateItem #
        Resource: !GetAtt UsersTable.Arn
      - Effect: Allow # we need to write to TweetsTable and TimelinesTable
        Action: dynamodb:PutItem
        Resource:
          - !GetAtt TweetsTable.Arn
          - !GetAtt TimelinesTable.Arn
```

Poor man's enum in JS:

```javascript
// ./lib/constants.js
// poor man's enum in JS
const TweetTypes = {
  TWEET: 'Tweet',
  RETWEET: 'Retweet',
  REPLY: 'Reply',
}

module.exports = {
  TweetTypes,
}
```

_(15.2.2)_ Add the JS for the lambda function that will generate a tweet `ulid`
for the 3 DDB tables, write to Tweets and Timelines tables, and update Users
table.

```javascript
// ./functions/tweet.js

// (17.2.2) add the lambda function that will generate a tweet ulid for the 3 DDB tables,
// write to Tweets and Timelines tables, and update Users table
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument text - tweet(text: String!): Tweet!
  // we can extract that from event.arguments
  const {text} = event.arguments
  // we can get the username from event.identity.username (Lumigo and before in (13.2.1) )
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()

  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.TWEET,
    id,
    text,
    creator: username,
    createdAt: timestamp,
    replies: 0,
    likes: 0,
    retweets: 0,
  }

  // we need 3 operations; 2 writes to Tweets and Timelines tables, and and update to Users table
  await DocumentClient.transactWrite({
    TransactItems: [
      {
        Put: {
          TableName: TWEETS_TABLE,
          Item: newTweet,
        },
      },
      {
        Put: {
          TableName: TIMELINES_TABLE,
          Item: {
            userId: username,
            tweetId: id,
            timestamp,
          },
        },
      },
      {
        Update: {
          TableName: USERS_TABLE,
          Key: {
            id: username,
          },
          UpdateExpression: 'ADD tweetsCount :one',
          ExpressionAttributeValues: {
            ':one': 1,
          },
          // do not update if the user does not exist
          ConditionExpression: 'attribute_exists(id)',
        },
      },
    ],
  }).promise()

  return newTweet
}

module.exports = {
  handler,
}
```

`npm run deploy` and test the mutation at Appsync. Remember to
`npm run export:env` also.

![tweet-mutation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/z0ezr67acgvjhw10a5vj.png)

Verify the 3 tables at DDB.

![3-tables](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vywbwq8uocjfrpxeecr6.png)

### 18 Integration test for tweet mutation

The pattern is as follows:

- Create an event: an object which includes `identity.username` and
  `arguments.text`.
- Feed it to the handler (the handler causes 2 writes and update to DDB, hence
  the "integration")
- Check that the result matches the expectation (by reading the 3 tables from
  DDB, hence "integration")

We have to have a real user for this integration test, but it is still an
integration test given that we are feeding an event object to the handler.

Check out `__tests__/integration/tweet-integration.test.js`.

### 19 E2e test for tweet mutation

As a signed in user, make a graphQL request with the mutation `tweet`. This will
cause 3 db interactions. We do not have to repeat the same DB verifications as
the integration test, but we canverify the response from the mutation.

- Sign in
- Make a graphQL request with the tweet mutation and its text argument.
- Check the content of the response for the mutation

For the types, there are 3 key pieces of info:

- `tweet` takes `text` as an argument:

```
# schema.api.graphql
type Mutation {
  tweet(text: String!): Tweet!
```

- At the AppSync web console we build an example

```
mutation MyMutation {
  tweet(text: "") {
    id
    createdAt
    text
    replies
    likes
    retweets
  }
}
```

- In the test, when building the query we can take the text argument.

```javascript
const tweet = `mutation tweet($text: String!) {
      tweet(text: $text) {
        id
        createdAt
        text
        replies
        likes
        retweets
      }
    }`
```

Check out `__tests__/e2e/tweet-e2e.test.js`.

## 20 Implement `getTweets` query

`getTweets` is a query from `schema.api.graphql`.

```
type Query{
	getTweets(userId: ID!, limit: Int!, nextToken: String): TweetsPage!
}
```

We are going to get the tweets from DDB, therefore we need the usual Appsync
mapping-template yml and the vtl files query request and response.

(20.0) Add a mapping template to the yml.

```yml
# ./serverless.appsync-api.yml

mappingTemplates:
  - type: Query
    field: getMyProfile
    dataSource: usersTable

  - type: Mutation
    field: editMyProfile
    dataSource: usersTable

  - type: Query
    field: getImageUploadUrl
    dataSource: getImageUploadUrlFunction
    request: false
    response: false

  - type: Mutation
    field: tweet
    dataSource: tweetFunction
    request: false
    response: false

  # [20] Implement getTweets query
  # (20.0) Add the mapping template
  - type: Query
    field: getTweets
    dataSource: tweetsTable


 dataSources:
  - type: NONE
    name: none

  - type: AMAZON_DYNAMODB # (8.1, 12.0)
    name: usersTable
    config:
      tableName: !Ref UsersTable

  - type: AWS_LAMBDA # (15.0)
    name: getImageUploadUrlFunction
    config:
      functionName: getImageUploadUrl

  - type: AWS_LAMBDA # (17.2.0)
    name: tweetFunction
    config:
      functionName: tweet

  - type: AMAZON_DYNAMODB # (20.0) define a data source for the query
    name: tweetsTable
    config:
      tableName: !Ref TweetsTable
```

_(20.1)_ Add the .vtl files under `./mapping-templates/` for the request and
response.

In _(15.0)_ we created a table for the tweets, and we identified a `GlobalSecondaryIndex` called `byCreator`. We will be using it now. We utilize the mapping template reference for DDB at [1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html), [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html).
We can get userId (the first argument of the query) by ` $util.dynamodb.toDynamoDBJson($context.arguments.userId)`. For the 2nd
argument, `nextToken`, we can similarly use `$util.toJson($context.arguments.nextToken)`. `scanIndexForward` is synonymous to ascending order (latest tweet last), we want latest tweet first so this is set to `false`. We limit the number of tweets returned to be less than 25.

```
// Query.getTweets.request.vtl

// this part did not work in the unit test (19),
#if ($context.arguments.limit > 25)
  $util.error("max limit is 25")
#end
// so we used this (19)
#set ($isValidLimit = $context.arguments.limit <= 25)
$util.validate($isValidLimit, "max limit is 25")

{
  "version" : "2018-05-29",
  "operation" : "Query",
  "query" : {
    "expression" : "creator = :userId",
    "expressionValues" : {
      ":userId" : $util.dynamodb.toDynamoDBJson($context.arguments.userId)
    }
  },
  "index" : "byCreator",
  "nextToken" : $util.toJson($context.arguments.nextToken),
  "limit" : $util.toJson($context.arguments.limit),
  "scanIndexForward" : false,
  "consistentRead" : false,
  "select" : "ALL_ATTRIBUTES"
}
```

From the schema we know that the query responds with a type `TweetsPage`.

```
// schema.api.graphql
type Query{
	getTweets(userId: ID!, limit: Int!, nextToken: String): TweetsPage!
}

type TweetsPage {
  tweets: [ITweet!]
  nextToken: String
}
```

Because `tweets` will be an array, we extract that with `.items` in
` $util.toJson($context.result.items)`. For `nextToken`, if the token is an
empty string we want to turn it into null, so we use `defaultIfNullOrBlank`.
`nexToken` maps to `nextToken`.

```
// Query.getTweets.response.vtl

{
  "tweets": $util.toJson($context.result.items),
  "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
}
```

At the moment we do not have the Profile structure in the Tweet object, if we
look at DDB. Per the schema, that is something we want. What we have is
`creator`, which is the id of the user that created the tweet.

```
// schema.api.graphql

type Tweet implements ITweet {
  id: ID!
  profile: IProfile!
  createdAt: AWSDateTime!
  text: String!
  replies: Int!
  likes: Int!
  retweets: Int!
  liked: Boolean!
  retweeted: Boolean!
}

interface IProfile {
  id: ID!
  name: String!
  screenName: String!
  imageUrl: AWSURL
  backgroundImageUrl: AWSURL
  bio: String
  location: String
  website: AWSURL
  birthdate: AWSDate
  createdAt: AWSDateTime!
  tweets: TweetsPage!
  followersCount: Int!
  followingCount: Int!
  tweetsCount: Int!
  likesCounts: Int!
}
```

![tweet-object](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/2q83kl4cwejudeame5xr.png)

_(20.2)_ Take the `creator` id in the Tweet from DDB, and ask AppSync to read
the user information from `UsersTable`, so that we can populate the user profile
in the Tweet type of our schema. We do that by using nested resolvers. Create a
nested resolver in mapping Templates.

> When do we need nested resolvers?
>
> Oftentimes when we need to return another type, e.g. a Parent type might have a children property of type [Person]. A Customer type might have an orders array of type [Order] or a Person type might have a spouse property, also of type Person. 
>
> In all these examples, it's a relationship, which we can avoid eagerly loading the related item unless the caller asks for them. So if it's a nested resolver then GraphQL would know when to actually execute the nested resolver - ie. when the caller asks for the related entity in its query.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  - type: Query ##
  - type: Mutation ##
  # Yan recommends to organize the mapping templates by Query, Mutation and nested resolvers.
  # We went by the order of lessons instead so it is easier to follow when reading the notes.

  # nested resolvers

  - type: Tweet
    field: profile
    dataSource: usersTable
```

_(20.3)_ Create the `.vtl` files `Tweet.profile.request.vtl`,
`Tweet.profile.response.vtl` under `./mapping-templates/`

Since we have `creator` field in the `Tweet`, we can reference the nesting
parent with `$context.source` .

> Nested resolvers can only be implemented for graphQL types, not interfaces.

```
// Tweet.profile.request.vtl

{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.source.creator)
  }
}
```

From `schema.api.graphql` we see that `Profile` interface is implemented by both
`MyProfile` and `OtherProfile`. We need to differentiate between the two.

```
// Tweet.profile.response.vtl

#if (!$util.isNull($context.result))
  #if ($context.result.id == $context.identity.username)
    #set ($context.result["__typename"] = "MyProfile")
  #else
    #set ($context.result["__typename"] = "OtherProfile")
  #end
#end

$util.toJson($context.result)
```

Deploy with `npm run deploy`. Test an AppSync query. We need a confirmed user
from Cognito.

```
query MyQuery {
  getTweets(limit: 10, userId: "6b926c1a-6a54-42b3-9bf0-b623e54b1cf2") {
    nextToken
    tweets {
      id
      createdAt
      profile {
        id
        name
        screenName
        ... on MyProfile {
          id
          name
          followersCount
          followingCount
        }
        ... on OtherProfile {
          id
          name
          followedBy
        }
      }
      ... on Tweet {
        id
        likes
        replies
        retweets
        text
      }
    }
  }
}

```

![4-18-Appsync](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ysyu0a1p9b5hslog3nge.png)

### 21 Unit test `getTweets`

There is custom vtl code in `mapping-templates/Tweet.profile.response.vtl` and
`Query.getTweets.request.vtl` worth unit testing.

Testing the `.vtl` file, the approach is to:

- Create an AppSync context
- Get the template
- Use `amplify-velocity-template` to render the template, given the context
- Check the result

Check out `__tests__/unit/Tweet.profile.response.test.js` and
`__tests__/unit/Query.getTweets.request.test.js`.

### 22 E2e test getTweets

- Create the tweet (17)
- Get the tweet
- Test error case of 26 limit.

For the types, there are 3 key pieces of info:

- `getTweets` takes `userId`, `limit`, `nextToken` as arguments:

```
# schema.api.graphql
type Query {
  getTweets(userId: ID!, limit: Int!, nextToken: String): TweetsPage!
```

- At the AppSync web console we build an example

```
query MyQuery {
  getTweets(limit: 10, userId: "") {
    tweets {
      createdAt
      id
      profile
      ... on Tweet {
        id
        text
        replies
        likes
        retweets
      }
    }
  }
}
```

- In the test, when building the query we can take the text argument.

```javascript
const getTweets = `query getTweets($userId: ID!, $limit: Int!, $nextToken: String) {
      getTweets(userId: $userId, limit: $limit, nextToken: $nextToken) {
        nextToken
        tweets {
          id
          createdAt
          profile {
            id
            name
            screenName
          }

          ... on Tweet {
            text
            replies
            likes
            retweets
          }
        }
      }
    }`
```

Check out `__tests__/e2e/tweet-e2e.test.js`.

## 23 Implement `getMyTimeline` query

`getMyTimeline` is a query from `schema.api.graphql`.

```
type Query{
  getMyTimeline(limit: Int!, nextToken: String): TweetsPage!
}
```

We are going to get the timeline from DDB timelinesTable, therefore we need the usual Appsync
mapping-template yml and the vtl files query request and response.

(23.0) Add a mapping template to the yml.

```yml
# ./serverless.appsync-api.yml

mappingTemplates:
  ###
  - type: Query
    field: getTweets
    dataSource: tweetsTable
    
  # [23] Implement getmyTimeline query
  # (23.0) Add the mapping template to the yml
  - type: Query
    field: getMyTimeline
    dataSource: timelinesTable
    
 dataSources:
  - type: AMAZON_DYNAMODB 
    name: tweetsTable
    config:
      tableName: !Ref TweetsTable

  - type: AMAZON_DYNAMODB # (23.0) define a data source for the query
    name: timelinesTable
    config:
      tableName: !Ref TimelinesTable

```

_(23.1)_ Add the .vtl files under `./mapping-templates/` for the request and response. We utilize
the mapping template reference for DDB at [1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html), [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html). Very similar to (20.1). `userId` instead of `creatorId`, and the current user is the value which we get from `$context.identity.username`. We do not need `"index" : "byCreator"`. The response is identical to 20.1 as well.

```
// Query.getMyTimeline.request.vtl

#set ($isValidLimit = $context.arguments.limit <= 25)
$util.validate($isValidLimit, "max limit is 25")

{
  "version" : "2018-05-29",
  "operation" : "Query",
  "query" : {
    "expression" : "userId = :userId",
    "expressionValues" : {
      ":userId" : $util.dynamodb.toDynamoDBJson($context.identity.username)
    }
  },
  "nextToken" : $util.toJson($context.arguments.nextToken),
  "limit" : $util.toJson($context.arguments.limit),
  "scanIndexForward" : false,
  "consistentRead" : false,
  "select" : "ALL_ATTRIBUTES"
}
```

```
// Query.getMyTimeline.response.vtl

{
  "tweets": $util.toJson($context.result.items),
  "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
}
```

After we fetch the tweetId for the tweets on our timeline, we have to hydrate them from the Tweets table. We can use pipeline functions for that. Pipeline functions tell AppSync to perform multiple steps for a resolver; get a page of tweets from the timelines table and hydrate them by doing a batch get against Tweets table. But for now we can play with the types at `schema.api.graphql`.  *(23.2)* Add a type `UnhydratedTweetsPage` and make `getMyTimeline` return a `UnhydratedTweetsPage` instead of `TweetsPage`.

```
# schema.api.graphql

type Query {
  getMyTimeline(limit: Int!, nextToken: String): UnhydratedTweetsPage!
}
type UnhydratedTweetsPage {
  tweets: [ITweet!]
  nextToken: String
}
```

 *(23.3)* Now we have a type `UnhydratedTweetsPage`, and a `tweets` field we can attach a nested resolver to. We can have that resolver hydrate the data from a different table. Create a nested resolver that uses the `tweets` field of the type `UnhydratedTweetsPage`, to be used to get data from `tweetsTable`.

*(23.4)* For the nested resolver to work we need another set of `vtl` files under `mapping-templates/`.

* We will have access to a list of tweets from Timelines table, which has userId and tweetId. 
* We can use the tweetId to fetch the tweets from the Tweets table. 
* We are going the take the source tweets array from the `UnhydratedTweetsPage`, which are the items that we would fetch from Timelines table `tweets: [ITweet!]`, extract the tweet id into an array of tweets with just the id, Json serialize it, pass it to the BatchGetItem operation.

To add each tweet object into the array, use `$tweets.add($util.dynamodb.toMapValues($tweet))`. We have to use `$util,qr` to ignore the return value of the `$tweets.add` operation, otherwise the vtl interpreter will fail.

For the `tables` > TweetsTable > keys, after we're done populating the tweets array use `$util.toJson($tweets)` to serialize it.

*(23.5)* We need the value of the TweetsTable we are going to BatchGetItem from. To get this value we add a block to the `serverless.appsync-api.yml`

```yml
substitutions:
  TweetsTable: !Ref TweetsTable
```

```
// UnhydratedTweetsPage.tweets.request

#if ($context.source.tweets.size() == 0)
  #return([])
#end

// get the tweet ids in an array
// DDB batch get

#set ($tweets = [])
#foreach ($item in $context.source.tweets)
  #set ($tweet = {})
  #set ($tweet.id = $item.tweetId)
  $util.qr($tweets.add($util.dynamodb.toMapValues($tweet)))
#end

{
  "version" : "2018-05-29",
  "operation" : "BatchGetItem",
  "tables" : {
    "${TweetsTable}": {
      "keys": $util.toJson($tweets),
      "consistentRead": false
    }
  }
}
```

```
// UnhydratedTweetsPage.tweets.response.vtl

$util.toJson($context.result.data.${TweetsTable})
```

`npm run deploy` and test at AppSync web UI.

```
query MyQuery {
  getMyTimeline(limit: 10) {
    nextToken
    tweets {
      id
      profile {
        name
        screenName
        id
      }
      ... on Tweet {
        id
        likes
        replies
        retweets
        text
      }
    }
  }
}
```

![23](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/2cwnep1zj2cur7pl8vhg.png)

### 24 Test `getMyTimeline` query

The unit test for `getMyTimeline` would be duplicating the `getTweets`, because the vtl templates are near identical.

We can write a test for `UnhydratedTweetsPage.tweets.request.vtl` since there is plenty  going on there.

Check out `__tests__/unit/UnhydratedTweetsPage.tweets.request.test.js`.

For the e2e test:

- Create the tweet (17)
- getMyTimeline, check that there is a response
- Test error case of 26 limit.

For the types, there are 3 key pieces of info:

- `getMyTimeline` takes `limit`, `nextToken` as arguments:

```
# schema.api.graphql
type Query {
   getMyTimeline(limit: Int!, nextToken: String): UnhydratedTweetsPage!
```

- At the AppSync web console we build an example

```
query MyQuery {
  getMyTimeline(limit: 10) {
    nextToken
    tweets {
      id
      profile {
        name
        screenName
        id
      }
      ... on Tweet {
        id
        likes
        replies
        retweets
        text
      }
    }
  }
}
```

- In the test, when building the query we can take the text argument.

```javascript
    const getMyTimeline = `query getMyTimeline($limit: Int!, $nextToken: String) {
      getMyTimeline(limit: $limit, nextToken: $nextToken) {
        nextToken
        tweets {
          id
          createdAt
          profile {
            id
            name
            screenName
          }
  
          ... on Tweet {          
            text
            replies
            likes
            retweets
          }
        }
      }
    }`
```

Check out `__tests__/e2e/tweet-e2e.test.js`.

## 25 Use `context.info` to remove unnecessary DDB calls

Add some logic to our request template `Tweet.profile.request.vtl` to check what fields the query is actually asking for. If it is only asking for the for the id, return early without making a request to DDB.

```
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.source.creator)
  }
}
```

Becomes:

```
#if ($context.info.selectionSetList.size() == 1 && $context.info.selectionSetList[0] == "id")
  #set ($result = { "id": "$context.source.creator" })

  #if ($context.source.creator == $context.identity.username)
    #set ($result["__typename"] = "MyProfile")
  #else
    #set ($result["__typename"] = "OtherProfile")
  #end
  
  #return($result)
#end

{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.source.creator)
  }
}
```

## 26 Implement `like` mutation

```
type Mutation {
  like(tweetId: ID!): Boolean!
```

When we like a tweet:

* Increment the like count in the Users table. 
* For the tweet, in Tweetstable  increment the number of likes received.
* Introduce a new table (LikesTable) for which user has liked which tweet, and update that too.

*(26.0)* create a new DDB table to track which user has liked which tweet.

```yml
# serverless.yml
resources:
  Resources:
    LikesTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: userId # partition key
            KeyType: HASH
          - AttributeName: tweetId # sort key
            KeyType: RANGE
        AttributeDefinitions:
          - AttributeName: userId
            AttributeType: S
          - AttributeName: tweetId
            AttributeType: S
        Tags: # so that we can track the cost in AWS billing
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: likes-table
```

We have to update 3 tables when the like mutation happens. We can do this in a DDB transaction. (In _(17.1)_ we also updated 3 tables, but used a lambda resolver because we had to generate a `ulid`). As usual, we have to create a mapping template, dataSource  and `vtl` files.

In the vtl files we will:

* Create an entry in LikesTable with `userId` and `tweetId`.
* Update TweetsTable with `tweetId`.
* Update UsersTable with `userId`.

*(26.1)* Create a mapping template for `like`, dataSource for `likesTable` and for `likeMutation` .  When we need to do multiple transactions in an AppSync resolver, we need to create a dataSource for the mutation (`likeMutation`). When we want to use refer to the resources in a vtl file with ${resourceName}, we need to add it to the substitutions.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # (25.1) setup an AppSync resolver to update 3 tables when like happens: 
  # UsersTable, TweetsTable, LikesTable.
  - type: Mutation
    field: like
    dataSource: likeMutation

dataSources:
 - type: AMAZON_DYNAMODB
    name: likesTable # (25.1) define a data source for the mutation
    config:
      tableName: !Ref LikesTable
  # (25.1) we need the like mutation to create an entry in the LikesTable
  # then update UsersTable and TweetsTable
  # When we need to do multiple transactions in an AppSync resolver, 
  # we need to create a dataSource for the mutation
  - type: AMAZON_DYNAMODB
    name: likeMutation
    config:
      tableName: !Ref LikesTable
      # this is like (17.2.1) using lambda resolver to transact with 3 tables
      iamRoleStatements:
        - Effect: Allow
          Action: dynamodb:PutItem
          Resource: !GetAtt LikesTable.Arn
        - Effect: Allow
          Action: dynamodb:UpdateItem
          Resource:
            - !GetAtt UsersTable.Arn
            - !GetAtt TweetsTable.Arn

substututions:
  TweetsTable: !Ref TweetsTable
  # (25.1) when we want to use refer to the resources in a vtl file with ${resourceName},
  # we need to add it to the substitutions
  LikesTable: !Ref LikesTable
  UsersTable: !Ref UsersTable

```

*(26.2)* Create the `vtl` files.

`Mutation.like.request.vtl`

```
{
  "version": "2018-05-29",
  "operation": "TransactWriteItems",
  "transactItems": [
    {
      "table": "${LikesTable}",
      "operation": "PutItem",
      "key": {
        "userId": $util.dynamodb.toDynamoDBJson($context.identity.username),
        "tweetId": $util.dynamodb.toDynamoDBJson($context.arguments.tweetId)
      },
      "condition": {
        "expression": "attribute_not_exists(tweetId)"
      }
    },
    {
      "table": "${TweetsTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.arguments.tweetId)
      },
      "update": {
        "expression": "ADD likes :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    },
    {
      "table": "${UsersTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.identity.username)
      },
      "update": {
        "expression": "ADD likesCounts :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    }
  ]
}
```

`Mutation.like.response.vtl`

```
#if (!$util.isNull($context.result.cancellationReasons))
  $util.error('DynamoDB transaction error')
#end

#if (!$util.isNull($context.error))
  $util.error('Failed to execute DynamoDB transaction')
#end

true
```

`npm run deploy` and observe the new table in DDB.

![4-DDB-tables](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ap1uq047f04q3i3ieyvp.png)

Grab a `tweetId` from `TweetsTable`, create an AppSync mutation to like the tweet.

![like-mutation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/fn1hebhj1qp65nqhlql5.png)

After the like, the `LikesTable` should populate.

![likes-table](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qvcdtgayse3i4a5tc958.png)

### 27 Implement `Tweet.liked` nested resolver

We can now implement the `liked: Boolean!` since we have the like mutation. It is going to be nested resolver as in `Tweet.profile`

```
# schema.api.graphql

interface ITweet {
  id: ID!
  profile: IProfile!
  createdAt: AWSDateTime!
}

type Tweet implements ITweet {
  id: ID!
  profile: IProfile!
  createdAt: AWSDateTime!
  text: String!
  replies: Int!
  likes: Int!
  retweets: Int!
  liked: Boolean!
  retweeted: Boolean!
}
```

*(27.0)* Create a nested resolved for `liked ` field. 

```yml
# serverless.appsync-api.yml	
mappingTemplates:
  ## QUERIES
  ## MUTATIONS

  ## NESTED RESOLVERS
  - type: Tweet
    field: profile
    dataSource: usersTable

  # [27] Implement the Tweet.liked nested resolver
  # (27.0) create a nested resolver for liked field
  - type: Tweet
    field: liked
    dataSource: likesTable
```

*(27.1)* Create vtl files `liked` request and response.

 `Tweet.liked.request.vtl` 

```
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "userId" : $util.dynamodb.toDynamoDBJson($context.identity.username),
    "tweetId" : $util.dynamodb.toDynamoDBJson($context.source.id)
  }
}
```

`Tweet.liked.response.vtl`

```
#if ($util.isNull($context.result))
  false
#else
  true
#end

```

### 28 Refactor tests to use graphQL fragments

GraphQL fragments is a utility to reduce duplication in queries.

Check out `test-helpers/graphql.js`, `test-helpers/graphql-fragments.js`, `__tests__/e2e/tweet-e2e.test.js`.

### 29 E2e Tests for `like` mutation

We want to update a tweet to `liked` and verify that. Try to like a 2nd time, get an error. Check out `__tests__/e2e/tweet-e2e.test.js`.

## 30 Implement `unlike` mutation

Unlike implementation is the reverse of like.

```
type Mutation {
  like(tweetId: ID!): Boolean!
  unlike(tweetId: ID!): Boolean!
```

*(30.0)* Create a mapping template for `unlike`, dataSource for `unlikeMutation`. When we need to do multiple transactions in an AppSync resolver, we need to create a dataSource for the mutation AND we already have the dataSource for `likesTable` from 26.1.  When we want to use refer to the resources in a vtl file with ${resourceName}, we need to add it to the substitutions, and we already have the `LikesTable` in the substitutions from (26.1).

```yml
# serverless.appsync-api.yml

mappingTemplates:
  - type: Mutation
    field: like
    dataSource: likeMutation
  # (30.1) setup an AppSync resolver to update 3 tables when unlike happens: 
	# UsersTable, TweetsTable, LikesTable.
  - type: Mutation
    field: unlike
    dataSource: unlikeMutation

dataSources:
  # (30.1) we need the like mutation to delete an entry in the LikesTable,
  # then update UsersTable and TweetsTable
  # When we need to do multiple transactions in an AppSync resolver, 
  # we need to create a dataSource for the mutation
  # We already have it from (26.1), so we just need to add the deleteItem permission
  - type: AMAZON_DYNAMODB
    name: unlikeMutation
    config:
      tableName: !Ref LikesTable
      iamRoleStatements: tables
        - Effect: Allow
          Action: dynamodb:DeleteItem
          Resource: !GetAtt LikesTable.Arn
        - Effect: Allow
          Action: dynamodb:UpdateItem
          Resource: 
            - !GetAtt UsersTable.Arn
            - !GetAtt TweetsTable.Arn
```

*(26.2)* Create the `vtl` files.

`Mutation.unlike.request.vtl`

```
{
  "version": "2018-05-29",
  "operation": "TransactWriteItems",
  "transactItems": [
    {
      "table": "${LikesTable}",
      "operation": "DeleteItem",
      "key": {
        "userId": $util.dynamodb.toDynamoDBJson($context.identity.username),
        "tweetId": $util.dynamodb.toDynamoDBJson($context.arguments.tweetId)
      },
      "condition": {
        "expression": "attribute_exists(tweetId)"
      }
    },
    {
      "table": "${TweetsTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.arguments.tweetId)
      },
      "update": {
        "expression": "ADD likes :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(-1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    },
    {
      "table": "${UsersTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.identity.username)
      },
      "update": {
        "expression": "ADD likesCounts :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(-1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    }
  ]
}
```

`Mutation.unlike.response.vtl`

```
#if (!$util.isNull($context.result.cancellationReasons))
  $util.error('DynamoDB transaction error')
#end

#if (!$util.isNull($context.error))
  $util.error('Failed to execute DynamoDB transaction')
#end

true
```

`npm run deploy`.

### 31 E2e test for `unlike` mutation

We want to update a tweet to `liked` and verify that. Try to like a 2nd time, get an error. Check out `__tests__/e2e/tweet-e2e.test.js`.

## 32 Implement `getLikes` query

`getLikes` is very similar to `getMyTimeline` (23); the schemas are the same with `userId` as the partition key, and `tweetId` as sort key. To get the tweets that a user likes, we just need to query the `LikesTable` against the user's `userId`. We have the same challenge we had in (23) with `getMyTimeline`; we don't have everything about the tweet itself and we need to hydrate it afterward.

![32-beginning](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vxd0ofgqvuco7voxc46h.png)

We can use the same trick in (23); instead of returning a `TweetsPage`, we can return a `UnhydratedTweetsPage`. After we fetch the tweetId for the tweets on our timeline, we can hydrate them from the Tweets table. 

```
# schema.api.graphql

type Query {
  getMyTimeline(limit: Int!, nextToken: String): UnhydratedTweetsPage!
  # (32.0) change return type from TweetsPage to UnhydratedTweetsPage
	getLikes(userId: ID!, limit: Int!, nextToken: String): UnhydratedTweetsPage!
}

type UnhydratedTweetsPage {
  tweets: [ITweet!]
  nextToken: String
}
```

*(32.1)* Add the mapping template.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # (32.1) add an entry to the mappingTemplates
  - type: Query
    field: getLikes
    dataSource: likesTable
  
```

*(32.2)* Add the `vtl` files for `Query.getLikes.request.vtl` and `Query.getLikes.response.vtl`. These will be similar to `getMyTimeline` in (23).

```
#set ($isValidLimit = $context.arguments.limit <= 25)
$util.validate($isValidLimit, "max limit is 25")

{
  "version" : "2018-05-29",
  "operation" : "Query",
  "query" : {
    "expression" : "userId = :userId",
    "expressionValues" : {
      ":userId" : $util.dynamodb.toDynamoDBJson($context.identity.username)
    }
  },
  "nextToken" : $util.toJson($context.arguments.nextToken),
  "limit" : $util.toJson($context.arguments.limit),
  "scanIndexForward" : false,
  "consistentRead" : false,
  "select" : "ALL_ATTRIBUTES"
}
```

```
{
  "tweets": $util.toJson($context.result.items),
  "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
}
```

`npm run deploy`.

### 33 E2e test for `getLikes` query

`getLikes` query is similar to `getMyTimeline` query (24), the only distinction is that we need to reflect the arguments at the schema.

```js
const getMyTimeline = `query getMyTimeline($limit: Int!, $nextToken: String) {
      getMyTimeline(limit: $limit, nextToken: $nextToken) {
        nextToken
        tweets {
          ... iTweetFields
        }
      }
    }`

const getLikes = `query getLikes($userId: ID!, $limit: Int!, $nextToken: String) {
    getLikes(userId: $userId, limit: $limit, nextToken: $nextToken) {
      nextToken
      tweets {
        ... iTweetFields
      }
    }
  }`
```

Check out `__tests__/e2e/tweet-e2e.test.js`.

## 34 Implement `Profile.tweets` nested resolver

>When do we need nested resolvers?
>
>Think of its as a utility to avoid over-fetching. Oftentimes when we need to return another type, e.g. a Parent type might have a children property/field of type [Child]. A Customer type might have an orders array of type [Order] or a Person type might have a spouse property, also of type [Person]. 
>
>In all these examples, it's a relationship. We can avoid eagerly-loading the related item (ex: children, orders, spouse) unless the caller asks for them. So if it's a nested resolver then GraphQL would know when to actually execute the nested resolver - ie. when the caller specifically asks for it.

In this case we only want to query the `tweets` field of a `IProfile` (`MyProfile`, `OtherProfile`).

*(34.0)*  Create a nested resolver for MyProfile.tweet.

```yml
mappingTemplates:
  # Queries
  # Mutations
  # Nested resolvers

  # (34.0) Create a nested resolver for MyProfile.tweets
  - type: MyProfile
    field: tweets
    dataSource: tweetsTable
```

*(34.1)* Add the `vtl` files. These are similar to `getTweets` (20).

`MyProfile.tweets.request.vtl`

```
{
  "version" : "2018-05-29",
  "operation" : "Query",
  "query" : {
    "expression" : "creator = :userId",
    "expressionValues" : {
      ":userId" : $util.dynamodb.toDynamoDBJson($context.source.id)
    }
  },
  "index" : "byCreator",
  "limit" : $util.toJson(10),
  "scanIndexForward" : false,
  "consistentRead" : false,
  "select" : "ALL_ATTRIBUTES"
}
```

`MyProfile.tweets.response.vtl`

```
{
  "tweets": $util.toJson($context.result.items),
  "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
}
```

`npm run deploy`.

### E2e testing for `Profile.tweets`

For testing we have to be careful about an infinite loop situation when querying or mutation `myProfileFields`. `MyProfile.tweet` returns a `TweetsPage`, which in turn returns a `tweets` field, which in turn returns an `ITweet`, which in turn returns another `IProfile`.

```
// schema.api.graphql
type MyProfile implements IProfile { (0)
  id: ID!
  name: String!
  screenName: String!
  imageUrl: AWSURL
  backgroundImageUrl: AWSURL
  bio: String
  location: String
  website: AWSURL
  birthdate: AWSDate
  createdAt: AWSDateTime!
  tweets: TweetsPage! (1)
  followersCount: Int!
  followingCount: Int!
  tweetsCount: Int!
  likesCounts: Int!
}

type TweetsPage {
  tweets: [ITweet!] (2)
  nextToken: String
}

interface ITweet {
  id: ID!
  profile: IProfile! (3)
  createdAt: AWSDateTime!
}
```

 Make sure to not include `tweets` in `myProfileFragment ` being used in e2e tests

```js
// test-helpers/graphql-fragments.js
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
  // do not!
  tweets {
    nextToken
    tweets {
      ... iTweetFields
    }
  }
}
`
```

Instead, add `tweets` field to only to `getMyProfile` and `editMyProfile` . This way when we make the calls, we're going to get the first page of tweets back. But, when we fetch the profiles for these tweets, it will not go into an infinite loop.

```js
// __tests__/e2e/user-profile.test.js
const getMyProfile = `query getMyProfile {
			getMyProfile {
				... myProfileFields
				// add it here
        tweets {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
			}
		}`

const editMyProfile = `mutation editMyProfile($input: ProfileInput!) {
      editMyProfile(newProfile: $input) {
        ... myProfileFields
        // add it here
        tweets {
          nextToken
          tweets {
            ... iTweetFields
          }
        }
      }
    }`
```

## 35 Implement `retweet` mutation

*(35.0)* create a new DDB table to track which user has retweeted which tweet. Similar to (26.0)

*(35.1)* We need to add an entry to the `TweetsTable` for the retweet, which means we need a tweetId, which is a `ulid` and requires us to use a lambda resolver. Similar to (17.2). `retweet` function will need the additional `iamRoleStatemements`.

```yml
# serverless.yml

functions:
  ## 
  retweet:
    handler: functions/retweet.handler
    environment:
      USERS_TABLE: !Ref UsersTable
      TWEETS_TABLE: !Ref TweetsTable
      TIMELINES_TABLE: !Ref TimelinesTable
      RETWEETS_TABLE: !Ref RetweetsTable
      # Get from Tweets, Update Tweets and Users, 
      # write to Tweets, Timelines, Retweets,
    iamRoleStatements:
      - Effect: Allow
        Action: dynamodb:GetItem
        Resource: !GetAtt TweetsTable.Arn
      - Effect: Allow
        Action: dynamodb:UpdateItem
        Resource: 
          - !GetAtt TweetsTable.Arn
          - !GetAtt UsersTable.Arn
      - Effect: Allow
        Action: dynamodb:PutItem
        Resource:
          - !GetAtt TweetsTable.Arn
          - !GetAtt TimelinesTable.Arn
          - !GetAtt RetweetsTable.Arn

resources:
  Resources:
    ## ...
    RetweetsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: userId
            KeyType: HASH
          - AttributeName: tweetId
            KeyType: RANGE
        AttributeDefinitions:
          - AttributeName: userId
            AttributeType: S
          - AttributeName: tweetId
            AttributeType: S
        Tags:
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: retweets-table
```

*(35.2)* add a mapping template for the retweet mutation. Similar to (17.2.0), we want AppSync to invoke the lambda function directly without going through a custom mapping template.

*(35.3)* Define a data source for the mutation

```yml
# serverless.appsync-api.yml

mappingTemplates:
  
	- type: Mutation
    field: retweet
    dataSource: retweetFunction
    request: false
    response: false
    
datasources:
  ## DDB data sources
  ## Lambda data sources
  
  - type: AWS_LAMBDA
    name: retweetFunction
    config:
      functionName: retweet
```

*(35.4)* Create the lambda function for retweet. Similar to (17.2.2).

* Get from Tweets,
* Write to Tweets, Timelines, Retweets
* Update Tweets and Users

```js
// (35.4) add the lambda function that will
// Get from Tweets, write to Tweets, Timelines, Retweets, Update Tweets and Users
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE, RETWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument retweet - retweet(tweetId: ID!): Boolean!
  // we can extract that from event.arguments
  const {tweetId} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()

  // get from Tweets
  const getTweetResp = await DocumentClient.get({
    TableName: TWEETS_TABLE,
    Key: {
      id: tweetId,
    },
  }).promise()

  const tweet = getTweetResp.Item

  if (!tweet) {
    throw new Error('Tweet is not found')
  }

  /* from the schema:
  type Retweet implements ITweet {
    id: ID!
    profile: IProfile!
    createdAt: AWSDateTime!
    retweetOf: ITweet!
  }
  */
  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.RETWEET,
    id,
    creator: username,
    createdAt: timestamp,
    retweetOf: tweetId,
  }

  // write to Tweets, Retweets (only write to Timelines if it's not the same user)
  // update Tweets, Users

  const transactItems = [
    {
      Put: {
        TableName: TWEETS_TABLE,
        Item: newTweet,
      },
    },
    {
      Put: {
        TableName: RETWEETS_TABLE,
        Item: {
          userId: username,
          tweetId,
          createdAt: timestamp,
        },
        ConditionExpression: 'attribute_not_exists(tweetId)',
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD retweets :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: {
          id: username,
        },
        UpdateExpression: 'ADD tweetsCount :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
  ]

  console.log(`creator: [${tweet.creator}]; username: [${username}]`)
  // if it's not the same user, write to Timelines
  if (tweet.creator !== username) {
    transactItems.push({
      Put: {
        TableName: TIMELINES_TABLE,
        Item: {
          userId: tweet.creator,
          tweetId: id,
          timestamp,
        },
      },
    })
  }

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return true
}

module.exports = {
  handler,
}
```

`npm run deploy` and `npm run export:env`.

## 36 Implement Retweet nested resolvers

*(36.0)* Create a nested resolver to get the profile on Retweet. We need the profile field, and we already have the vtl files for that in (20.3) for `getTweets`.

*(36.1)* Create a nested resolver to fetch the retweeted tweet on Retweet

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # Queries
  # Mutations
  
  # Nested resolver
  - type: Retweet
    field: profile
    dataSource: usersTable
    request: Tweet.profile.request.vtl
    response: Tweet.profile.response.vtl
  
  - type: Retweet
    field: retweetOf
    dataSource: tweetsTable
```

*(36.2)* Create the `vtl` files for `Retweet.retweetOf.request` and `response`.

```
// Retweet.retweetOf.request.vtl
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.source.retweetOf)
  }
}
```

```
// Retweet.retweetOf.request.vtl
$util.toJson($context.result)
```

`npm run deploy`

### 37 Integration test for retweet mutation

The pattern is as follows:

- Create an event: an object which includes `identity.username` and
  `arguments.tweetId`.
- Feed it to the handler (the handler causes writes and updates to 4 DDB tables, hence
  the "integration")
- Check that the result matches the expectation (by reading the 4 tables from
  DDB, hence "integration")

We have to have a real user for this integration test, but it is still an integration test given that we are feeding an event object to the handler.

Check out `__tests__/integration/retweet-self-integration.test.js`, `__tests__/integration/retweet-other-integration.test.js`.

### 38 E2e test for retweet mutation

*(38.0)* When a user reweets their own tweet, and get their tweets, we want to get the information about the retweet (reweetOf). The `retweeted` boolean is on the `type Tweet`, so we need to add a nested resolver for that.

(38.1) To enable that, although this is the test section, we added to the `serverless.appsync-api.yml` to increase retweet capabilities, and we added 2 vtl files. Reweets are similar to likes.

```yml
# serverless.appsync-api.yml
mappingTemplates:
  ## Nested resolvers
  # (38.0) #  add a nested resolver for reweeted 
  # similar to liked at (27.0)
  - type: Tweet
    field: retweeted
    dataSource: retweetsTable
    
dataSources:
  # (38.1) add a data source for the rested resolver
  - type: AMAZON_DYNAMODB
    name: retweetsTable
    config:
      tableName: !Ref RetweetsTable
```

```
# mappingtemplates/Tweet.retweeted.request.vtl
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "userId" : $util.dynamodb.toDynamoDBJson($context.identity.username),
    "tweetId" : $util.dynamodb.toDynamoDBJson($context.source.id)
  }
}
```

```
# mappingtemplates/Tweet.retweeted.response.vtl

#if ($util.isNull($context.result))
  false
#else
  true
#end
```

Check out `__tests__/e2e/tweet-e2e.test.js`.

## 39 Implement unretweet mutation

*(39.0)* add a mapping template for the unretweet mutation. Similar to (35.2) retweet mutation and (17.2.0) tweet mutation, we want AppSync to invoke the lambda function directly without going through a custom mapping template.

*(39.1)* Define a data source for the mutation (similar to 35.3)

```yml
# serverless.appsync-api.yml

mappingTemplates: 
  - type: Mutation
    field: unretweet
    dataSource: unretweetFunction
    request: false
    response: false
    
datasources:
  ## DDB data sources
  ## Lambda data sources
  
  - type: AWS_LAMBDA
    name: unretweetFunction
    config:
      functionName: unretweet
```

*(39.2)* Add the lambda function to `serverless.yml`, similar to (35.1).

```yml
# serverless.yml

functions:
  unretweet:
    handler: functions/unretweet.handler
    environment:
      USERS_TABLE: !Ref UsersTable
      TWEETS_TABLE: !Ref TweetsTable
      TIMELINES_TABLE: !Ref TimelinesTable
      RETWEETS_TABLE: !Ref RetweetsTable
    iamRoleStatements:
      - Effect: Allow
        Action: dynamodb:GetItem
        Resource: !GetAtt TweetsTable.Arn
      # we have to query DDB for the retweet so that we can delete it
      # we use CloudFormation's !Sub to interpolate the ARN of the table
      - Effect: Allow
        Action: dynamodb:Query
        Resource: !Sub '${TweetsTable.Arn}/index/retweetsByCreator'
      - Effect: Allow
        Action: dynamodb:UpdateItem
        Resource:
          - !GetAtt TweetsTable.Arn
          - !GetAtt UsersTable.Arn
      - Effect: Allow
        Action: dynamodb:DeleteItem
        Resource:
          - !GetAtt TweetsTable.Arn
          - !GetAtt TimelinesTable.Arn
          - !GetAtt RetweetsTable.Arn
          
resources:
  Resources
    TweetsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        AttributeDefinitions:
          - AttributeName: creator 
            AttributeType: S
          - AttributeName: id
            AttributeType: S
          - AttributeName: retweetOf # (39.2) add a new index for retweets
            AttributeType: S
        GlobalSecondaryIndexes:
          - IndexName: byCreator
            KeySchema:
              - AttributeName: creator 
                KeyType: HASH
              - AttributeName: id
                KeyType: RANGE
            Projection:
              ProjectionType: ALL 
          - IndexName: retweetsByCreator # (39.2) add a new index for retweets
            KeySchema:
              - AttributeName: creator
                KeyType: HASH
              - AttributeName: retweetOf
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
            Tags: ##..
          
```

(39.3) Implement the unretweet function.

* Delete the tweet from the TweetsTable, the RetweetsTable, and the TimelinesTable if it's not the same user
* Decrement the count on the UsersTable and the TweetsTable

```js
// functions/unretweet.js
// (39.3) Implement the unretweet function.
// Delete the tweet from the TweetsTable, the RetweetsTable, and the TimelinesTable if it's not the same user
// Decrement the count on the UsersTable and the TweetsTable
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const _ = require('lodash')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE, RETWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument unretweet - unretweet(tweetId: ID!): Boolean!
  // we can extract that from event.arguments
  const {tweetId} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity

  // get from Tweets
  const getTweetResp = await DocumentClient.get({
    TableName: TWEETS_TABLE,
    Key: {
      id: tweetId,
    },
  }).promise()

  const tweet = getTweetResp.Item
  if (!tweet) {
    throw new Error('Tweet is not found')
  }

  // At (35.3) retweet, we created the new tweet (type Retweet implements ITweet)
  // In contrast, now we have to query DDB for the retweet so that we can delete it
  const queryResp = await DocumentClient.query({
    TableName: TWEETS_TABLE,
    IndexName: 'retweetsByCreator',
    KeyConditionExpression: 'creator = :creator AND retweetOf = :tweetId',
    ExpressionAttributeValues: {
      ':creator': username,
      ':tweetId': tweetId,
    },
    Limit: 1,
  }).promise()

  const retweet = _.get(queryResp, 'Items.0')

  if (!retweet) throw new Error('Retweet is not found')

  // Delete the tweet from the TweetsTable, the RetweetsTable, and the TimelinesTable if it's not the same user
  // Decrement the count on the UsersTable and the TweetsTable

  const transactItems = [
    {
      Delete: {
        TableName: TWEETS_TABLE,
        Key: {
          id: retweet.id,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Delete: {
        TableName: RETWEETS_TABLE,
        Key: {
          userId: username,
          tweetId,
        },
        ConditionExpression: 'attribute_exists(tweetId)',
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD retweets :minusOne',
        ExpressionAttributeValues: {
          ':minusOne': -1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: {
          id: username,
        },
        UpdateExpression: 'ADD tweetsCount :minusOne',
        ExpressionAttributeValues: {
          ':minusOne': -1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
  ]

  console.log(`creator: [${tweet.creator}]; username: [${username}]`)
  // if it's not the same user, delete the retweet from Timelines
  if (tweet.creator !== username) {
    transactItems.push({
      Delete: {
        TableName: TIMELINES_TABLE,
        Item: {
          userId: username,
          tweetId: tweetId,
        },
      },
    })
  }

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return true
}

module.exports = {
  handler,
}
```

### 40 Integration test unreweet mutation

* Create an event: an object which includes `identity.username` and `arguments.tweetId`.

* Feed it to the handler (the handler causes writes and updates to DDB, hence the "integration")

* Check that the result matches the expectation (by reading the 4 tables from DDB, hence "integration")

Check out `__tests__/integration/unretweet-self-integration.test.js`

### 41 E2e test unretweet mutation

Arrange: tweet, retweet

Action: unretweet

Assert: should not see the retweet

Check out `__tests__/e2e/tweet-e2e.test.js`

## 42 Implement reply mutation



```
# schema.api.graphql
type Mutation { 
	reply(tweetId: ID!, text: String!): Reply!

```

*(42.0)* add a mapping template for the reply mutation. Similar to (35.2) (39.0).

When replying we have to generate a new tweet, create an id for it (ulid) therefore we need a lambda function.

*(42.1)* Define a data source for the mutation

```yml
# serverless.appsync-api.yml

mappingTemplates:
  - type: Mutation
    field: reply
    dataSource: replyFunction
    request: false
    response: false
    
dataSources:
  - type: AWS_LAMBDA
    name: replyFunction
    config:
      functionName: reply
```

*(42.2)* Add the lambda function to `serverless.yml`.  Similar to (35.1) retweets without the retweet table.

* Get from Tweets
* Update Tweets and Users 
* Write to Tweets, Timelines

```yml
# serverless.yml

functions:
	reply:
    handler: functions/reply.handler
    environment:
      USERS_TABLE: !Ref UsersTable
      TWEETS_TABLE: !Ref TweetsTable
      TIMELINES_TABLE: !Ref TimelinesTable
    iamRoleStatements:
      - Effect: Allow
        Action: dynamodb:GetItem
        Resource: !GetAtt TweetsTable.Arn
      - Effect: Allow
        Action: dynamodb:UpdateItem
        Resource: 
          - !GetAtt TweetsTable.Arn
          - !GetAtt UsersTable.Arn
      - Effect: Allow
        Action: dynamodb:PutItem
        Resource:
          - !GetAtt TweetsTable.Arn
          - !GetAtt TimelinesTable.Arn
```

(42.3) add the lambda function that will

* Get from Tweets

* Update Tweets and Users

* Write to Tweets, Timelines

```js
// functions/reply.js

// (42.3) add the lambda function that will
// * Get from Tweets
// * Update Tweets and Users
// * Write to Tweets, Timelines
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const ulid = require('ulid')
const {TweetTypes} = require('../lib/constants')
const {getTweetById} = require('../lib/tweets')
const _ = require('lodash')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

async function getUserIdsToReplyTo(tweet) {
  let userIds = [tweet.creator]
  if (tweet.__typename === TweetTypes.REPLY) {
    userIds = userIds.concat(tweet.inReplyToUserIds)
  } else if (tweet.__typename === TweetTypes.RETWEET) {
    const retweetOf = await getTweetById(tweet.retweetOf)
    userIds = userIds.concat(await getUserIdsToReplyTo(retweetOf))
  }

  return _.uniq(userIds)
}
// ramda version
// const getUserIdsToReplyToR = async tweet => {
//   const retweetOf = await getTweetById(tweet.retweetOf)
//   return R.pipe(
//     x => (x.__typename === TweetTypes.REPLY ? x.inReplyToUserIds : []),
//     x =>
//       x.__typename === TweetTypes.RETWEET ? getUserIdsToReplyTo(retweetOf) : x,
//     x => [tweet.creator].concat(x),
//     R.uniq,
//   )(tweet)
// }

const handler = async event => {
  // we know from graphQL schema the arguments for reply - reply(tweetId: ID!, text: String!): Reply!
  // we can extract both from event.arguments
  const {tweetId, text} = event.arguments
  // we can get the username from event.identity.username
  // we need it because reply is like a new tweet, so we need to know who created it
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid.ulid()
  const timestamp = new Date().toJSON()

  // get from Tweets (we can use a helper)
  const tweet = await getTweetById(tweetId)

  if (!tweet) throw new Error('Tweet is not found')

  // get the user ids to reply to
  const inReplyToUserIds = await getUserIdsToReplyTo(tweet)

  /* from the schema:
		type Reply implements ITweet {
			id: ID!
			profile: IProfile!
			createdAt: AWSDateTime!
			inReplyToTweet: ITweet!
			inReplyToUsers: [IProfile!]
			text: String!
			replies: Int!
			likes: Int!
			retweets: Int!
			liked: Boolean!
			retweeted: Boolean!
		}
  */
  const newTweet = {
    // __typename helps us identify between the 3 types that implement ITweet (Tweet, Retweet, Reply)
    __typename: TweetTypes.REPLY,
    id,
    creator: username,
    createdAt: timestamp,
    inReplyToTweetId: tweetId,
    inReplyToUserIds,
    text,
    replies: 0,
    likes: 0,
    retweets: 0,
  }

  // * Get from Tweets
  // * Update Tweets and Users
  // * Write to Tweets, Timelines (if we have write for tweetsTable, we have read too)

  const transactItems = [
    {
      Put: {
        TableName: TWEETS_TABLE,
        Item: newTweet,
      },
    },
    {
      Update: {
        TableName: TWEETS_TABLE,
        Key: {
          id: tweetId,
        },
        UpdateExpression: 'ADD replies :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: {
          id: username,
        },
        UpdateExpression: 'ADD tweetsCount :one',
        ExpressionAttributeValues: {
          ':one': 1,
        },
        ConditionExpression: 'attribute_exists(id)',
      },
    },
    {
      Put: {
        TableName: TIMELINES_TABLE,
        Item: {
          userId: username,
          tweetId: id,
          timestamp,
          inReplyToTweetId: tweetId,
          inReplyToUserIds,
        },
      },
    },
  ]

  await DocumentClient.transactWrite({
    TransactItems: transactItems,
  }).promise()

  return true
}

module.exports = {
  handler,
}
```

### 43 Integration test for reply mutation

- Create an event: an object which includes `identity.username` and `arguments.tweetId` and `arguments.text`.

- Feed it to the handler (the handler causes writes and updates to DDB, hence the "integration")

- Check that the result matches the expectation (by reading the 3 tables from DDB, hence "integration")

Check out `__tests__/integration/reply.test.js`.

## 44 Implement reply nested resolvers `profile`, `inReplyToTweet`, `inReplyToUsers`

In reply we have 3 properties that are a type of interfaces:

```
  profile: IProfile!
  inReplyToTweet: ITweet!
  inReplyToUsers: [IProfile!]
```

 As explained in _(20.2)_, we need nested resolvers when our types are returning other types.

```
type Reply implements ITweet {
  id: ID!
  profile: IProfile!
  createdAt: AWSDateTime!
  inReplyToTweet: ITweet!
  inReplyToUsers: [IProfile!]
  text: String!
  replies: Int!
  likes: Int!
  retweets: Int!
  liked: Boolean!
  retweeted: Boolean!
}
```

### `profile` nested resolver

*(44.0)* Create a nested resolver to get the profile on Reply. Similar to (36.0) Retweet.profile.

We can reuse the `vtl` files for `Tweet.profile`. 

```yml
mappingTemplates:
## Queries
## Mutations
## Nested fields
  - type: Reply
    field: profile
    dataSource: usersTable
    request: Tweet.profile.request.vtl
    response: Tweet.profile.response.vtl
```

### `inReplyToTweet` nested resolver

*(44.1)* Create a nested resolver to get the inReplyToUsers on Reply, similar to (36.1) Retweet.retweetOf.

```yml
mappingTemplates:

  - type: Reply
    field: inReplyToTweet
    dataSource: tweetsTable
```

*(44.3)* Create the `vtl` files `Reply.inReplyToTweet.request.vtl`,  `Reply.inReplyToTweet.response.vtl`, these are very similar to (36.2) Retweet nested resolvers. 

```
# Reply.inReplyToTweet.request.vtl
{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "id" : $util.dynamodb.toDynamoDBJson($context.source.inReplyToTweetId)
  }
}
```

```
# Reply.inReplyToTweet.response.vtl

$util.toJson($context.result)
```

### `inReplyToUsers` nested resolver

*(44.4)* Create a nested resolver to get the inReplyToUsers on Reply. 

```yml
mappingTemplates:

  - type: Reply
    field: inReplyToUsers
    dataSource: usersTable
    
    
  # (46.0) added during e2e when we realized we need to get the profile of the user who retweeted the tweet
  - type: Reply
    field: retweeted
    dataSource: retweetsTable
    request: Tweet.retweeted.request.vtl
    reply: Tweet.retweeted.reply.vtl

  # (46.0) added during e2e when we realized we need to get the profile of the user who liked the tweet
  - type: Reply
    field: liked
    dataSource: likesTable
    request: Tweet.liked.request.vtl
    reply: Tweet.liked.reply.vtl
```

*(44.5)* Create the `vtl` files `Reply.inReplyToUsers.request.vtl` and `Reply.inReplyToUsers.response.vtl`.

```
#if ($context.source.inReplyToUsers.size() == 0)
  #return([])
#end

#set ($users = [])
#if ($context.info.selectionSetList.size() == 1 && $context.info.selectionSetList[0] == "id")
  #foreach ($id in $context.source.inReplyToUsers)
    #set ($user = { "id": "$id" })

    #if ($id == $context.identity.username)
      #set ($user["__typename"] = "MyProfile")
    #else
      #set ($user["__typename"] = "OtherProfile")
    #end

    $util.qr($users.add($user))

  #end 
  
  #return($users)

#else 
  #foreach ($id in $context.source.inReplyToUsers)
    #set ($user = {})
    #set ($user.id = $id)
    $util.qr($users.add($util.dynamodb.toMapValues($user)))
  #end
#end

{
  "version" : "2018-05-29",
  "operation" : "BatchGetItem",
  "tables" : {
    "${UsersTable}": {
      "keys": $util.toJson($users),
      "consistentRead": false
    }
  }
}
```

```
#foreach ($user in $context.result.data.${UsersTable})
  #if ($user.id == $context.identity.username)
    #set ($user["__typename"] = "MyProfile")
  #else
    #set ($user["__typename"] = "OtherProfile")
  #end
#end 

$util.toJson($context.result.data.${UsersTable})
```

### 45 Unit test `Reply.inReplyToUsers.vtl`

Similar to `Tweet.profile.request` (21.0). 

- Create an AppSync context

- Get the template

- Use `amplify-velocity-template` to render the template, given the context

- Check the result

Check out `__tests__/unit/Reply.inReplyToUsers.test.js`.

### 46 E2e test reply mutation

Arrange:  UserA tweet, UserB reply

Action: call getTweets or getMyTimeline

Assert: see the reply

Check out `__tests__/e2e/tweet-e2e.test.js`

## 47 Implement follow mutation

*(47.0)* We need a relationships table to track which user follows/blocks/etc. who. Add a `RelationshipsTable` to `serverless.yml`.

```yml
# serverless.yml
resources:
  Resources:
  ## ...
    RelationshipsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: userId
            KeyType: HASH
          - AttributeName: sk # sk for sort key
            KeyType: RANGE
        AttributeDefinitions:
          - AttributeName: userId
            AttributeType: S
          - AttributeName: sk
            AttributeType: S
          - AttributeName: otherUserId
            AttributeType: S
        GlobalSecondaryIndexes:
          - IndexName: byOtherUser
            KeySchema:
              - AttributeName: otherUserId
                KeyType: HASH
              - AttributeName: sk
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        Tags:
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: relationships-table
```

*(47.1)* add a mapping template for follow mutation. Follow will use `vtl` templates.

*(47.2)* add a data source for the follow mutation - write to RelationshipsTable, update UsersTable. Also add a data source for relationships table

```yml
# serverless.appsync-api.yml

mappingTemplates:
  ## ..
  - type: Follow
    field: follow
    dataSource: followMutation
    
dataSources:
 ##
 # (47.2) datasource for follow mutation
 - type: AMAZON_DYNAMODB
    name: followMutation
    config:
      tableName: !Ref RelationshipsTable
      iamRoleStatements:
        - Effect: Allow
          Action: dynamodb:PutItem
          Resource: !GetAtt RelationshipsTable.Arn
        - Effect: Allow
          Action: dynamodb:UpdateItem
          Resource: !GetAtt UsersTable.Arn
 # (47.2) add a datasource for relationshipsTable
  - type: AMAZON_DYNAMODB
    name: relationshipsTable
    config:
      tableName: !Ref RelationshipsTable
          
substitutions:
  ##
  RelationshipsTable: !Ref RelationshipsTable
```

*(47.3)* Create the vtl files for `Mutation.follow.request.vtl` & `Mutation.follow.response`.

When a userA follows userB, we write to RelationshipsTable, where userB is the otherUserId.

![UserA-follows-UserB](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4j5o07zfyfbz5jn6xaky.png)

At userA and userB, we also increment followersCount & followingCount accordingly. All these can be done in a transaction using vtl (it can be in a lambda too btw).

> When do we use substitutions in `serverless.appsync-api.yml` ?
>
> Whenever we are using table names in vtl file, ex: `"${RelationshipsTable}"` we have to define it in substitutions.

```
// defining a variable in vtl
#set ($sk = "FOLLOWS_" + $context.arguments.userId)

{
  "version": "2018-05-29",
  "operation": "TransactWriteItems",
  "transactItems": [
    {
      "table": "${RelationshipsTable}",
      "operation": "PutItem",
      "key": {
        "userId": $util.dynamodb.toDynamoDBJson($context.identity.username),
        "sk": $util.dynamodb.toDynamoDBJson($sk)
      },
      "attributeValues": {
        "otherUserId": $util.dynamodb.toDynamoDBJson($context.arguments.userId),
        "createdAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601())
      },
      "condition": {
        "expression": "attribute_not_exists(sk)"
      }
    },
    {
      "table":"${UsersTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.identity.username)
      },
      "update": {
        "expression": "ADD followingCount :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    },
    {
      "table":"${UsersTable}",
      "operation": "UpdateItem",
      "key": {
        "id": $util.dynamodb.toDynamoDBJson($context.arguments.userId)
      },
      "update": {
        "expression": "ADD followersCount :one",
        "expressionValues": {
          ":one": $util.dynamodb.toDynamoDBJson(1)
        }
      },
      "condition": {
        "expression": "attribute_exists(id)"
      }
    }
  ]
}
```

```
#if (!$util.isNull($context.result.cancellationReasons))
  $util.error('DynamoDB transaction error')
#end

#if (!$util.isNull($context.error))
  $util.error('Failed to execute DynamoDB transaction')
#end

true
```

## 48 Implement nested resolvers `Profile.following` & `Profile.followedBy`

When userA views userB's profile, userA will see if they follow userB and if userB is following them.

*(48.0)* add nested resolvers for OtherProfile.following and OtherProfile.followedBy. 

```yml

mappingTemplates:
  # Queries
  # Mutations
  # Nested Resolvers
  # [34] Implement Profile.tweets nested resolver
  # (34.0) Create a nested resolver for MyProfile.tweets
  - type: MyProfile
    field: tweets
    dataSource: tweetsTable
  - type: OtherProfile
    field: tweets
    dataSource: tweetsTable
    request: MyProfile.tweets.request.vtl
    response: MyProfile.tweets.response.vtl

  # [48] Implement nested resolvers `Profile.following` & `Profile.followedBy`
  # (48.0) add nested resolvers for OtherProfile.following and OtherProfile.followedBy
  - type: OtherProfile
    field: following
    dataSource: relationshipsTable
  - type: OtherProfile
    field: followedBy
    dataSource: relationshipsTable
```

(48.1) create the `vtl` files for `OtherProfile.following` and `OtherProfile.followedBy`.

```
// OtherProfile.followedBy.request.vtl

#set ($sk = "FOLLOWS_" + $context.identity.username)

{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "userId" : $util.dynamodb.toDynamoDBJson($context.source.id),
    "sk" : $util.dynamodb.toDynamoDBJson($sk)
  }
}
```

```
// OtherProfile.followedBy.response.vtl

#if ($util.isNull($context.result))
  false
#else
  true
#end
```

```
// OtherProfile.following.request.vtl

#set ($sk = "FOLLOWS_" + $context.source.id)

{
  "version" : "2018-05-29",
  "operation" : "GetItem",
  "key" : {
    "userId" : $util.dynamodb.toDynamoDBJson($context.identity.username),
    "sk" : $util.dynamodb.toDynamoDBJson($sk)
  }
}
```

```
// OtherProfile.following.response.vtl

#if ($util.isNull($context.result))
  false
#else
  true
#end
```

## 49 Implement `getProfile` query

We are using the screen name and not user id for the sake of a nice url when viewing another user's profile

```
# schema.api.graphql

type Query {
	getProfile(screenName: String!): OtherProfile!	
}
```

We need a way to get a user by screen name, and for that we need to add the global secondary index to UsersTable.

*(49.0)* add the mapping template for the getProfile query.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # ..
  # (49.0) add the mapping template for the getProfile query
  - type: Query
    field: getProfile
    dataSource: usersTable
```

*(49.1)* Add `screenName` as  global secondary index to `UsersTable`

```yml
# serverless.yml

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        # (49.1) Add `screenName` as  global secondary index to `UsersTable`  
          - AttributeName: screenName
            AttributeType: S
        GlobalSecondaryIndexes:
          - IndexName: byScreenName
            KeySchema:
              - AttributeName: screenName
                KeyType: HASH
            Projection:
              ProjectionType: ALL
        Tags:
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: users-table
```

*(49.2)* add the `vtl` files

```
// Query.getProfile.request.vtl

{
  "version" : "2018-05-29",
  "operation" : "Query",
  "query" : {
    "expression" : "screenName = :screenName",
    "expressionValues" : {
      ":screenName" : $util.dynamodb.toDynamoDBJson($context.arguments.screenName)
    }
  },
  "index": "byScreenName",
  "limit" : 1,
  "scanIndexForward" : false,
  "consistentRead" : false,
  "select" : "ALL_ATTRIBUTES"
}
```

```
// Query.getProfile.response.vtl

#if ($context.result.items.size() == 0)
  null
#else
  $util.toJson($context.result.items[0])
#end
```

### 50 E2e test for follow mutation











































