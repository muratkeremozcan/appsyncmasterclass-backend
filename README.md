# appsyncmasterclass-backend

Backend for a Twitter Clone built with Serverless Framework, JS, AWS AppSyc,
Lambda, DynamoDB & Cognito.

In order to deploy, you need an AWS account and have to configure serverless.
After so, you may need to renew the authorization config periodically with the
CLI command. Once authorized, you deploy and can run e2e tests.

```bash
# needs node 16
nvm use
npm i # may need force

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

### Working on a branch

```bash

# deploy the temporary stack, the stack name can be anything
# conventionally we match it to the branch name
npm run sls -- deploy -s tmp

# export the new env vars to .env file
npm run sls export-env -- -s tmp && npm run sls manifest -- -s tmp

# run tests (including e2e) against the temporary stack
npm t

# destroy the branch
npm run sls -- remove -s tmp
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

[2] Create the file [schema.api.graphql](./schema.api.graphql). It is very much
like a TS file with types.

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
AppSync API to use it ([schema.api.graphql](./schema.api.graphql)).

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

## 4 Implement save user profile on `PostConfirmation`

- Capture the new user that gets created in Cognito.

- Save the user in a DynamoDB table:
  - (use a lambda trigger at _CognitoUserPool / Triggers_). After a user is
    confirmed, send a message to a lambda function, and that function can save
    the user in the DynamoDB table.
- That will allow us to use AppSync query and mutations.

_(4.0)_ Create a DynamoDB table to store user profiles:

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
`lambda:invokeFunction` permission for` ConfirmUserSignupLambdaFunction`.

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
interaction.![integration-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/irn19obybd4dfs9bni74.png)

There are things integration tests cannot cover, but they are still a good bang
for the
buck.![integration](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/gtkxvl1yh7fqwahptxfa.png)

E2e can cover everything, highest confidence but also costly. We need
some.![e2e-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1vtufpqa62fdgprlqt6c.png)

![e2e](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qjra5fzp7yr31r06dfzd.png)

Prop-tips from Yan:

- Avoid local simulation (e.g. LocalStack), they’re more work than is worth it,
  and hides common failure modes such as **misconfigured permissions and
  resource policies**.
- In integration tests, only use mocks for AWS services to simulate
  hard-to-reproduce **failure cases**. If it's happy path, do not mock AWS. You
  can mock your internal services/APIs.
- Use temporary stacks for feature branches to avoid destabilizing shared
  environments, and during CI/CD pipeline to run end-to-end tests to remove the
  overhead of cleaning up test data. `npm run sls -- deploy -s temp-stack` ,
  `npm run sls -- remove -s tmp`
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

We need to setup an AppSync resolver and have it get an item from DDB. _(8.1)_
Tell the serverless AppSync plugin where the Appsync templates are going to be,
and how to map them to the graphQL query.

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
> VTL is the template language that you can use with all AppSync integrations,
> including Lambda.
>
> We need something to tell AppSync how to make a request to the thing it's
> integrating with, be it a DynamoDB table, a Lambda function, an HTTP endpoint
> or something else. We need to tell AppSync how to transform the response
> because it's probably not in the right shape that the resolver needs to
> return.
>
> - With Lambda, AppSync provides a default request & response template so you
>   don't have to write one.
> - For pipeline functions, you can now also use JavaScript to create the
>   request and response templates instead of VTL, see
>   https://aws.amazon.com/blogs/aws/aws-appsync-graphql-apis-supports-javascript-resolvers.
>   But the JavaScript support is only limited to pipeline functions right now,
>   and in most cases, you probably don't need a pipeline function if your
>   resolver just needs to do one thing.
>
> As for why VTL, it boils down to not having a Lambda function = faster (adding
> another service is always gonna add some overhead, plus cold starts!), cheaper
> (not paying for lambda invocation) and more scalable (lambda has regional
> concurrency limit, so another limit that comes into play, on top of the
> throughput limits on AppSync)
>
> So if you can have AppSync connect to say, DynamoDB directly, then you should
> use vtl. If you're doing more complex stuff, then consider bringing in a
> Lambda function, but if it's just a sequence of CRUD operations against
> DynamoDB, then you can do the same thing with pipeline resolvers, which
> nowadays, also supports javascript resolvers as well, so you don't have to use
> VTL (the javascript resolvers only work for pipeline resolvers for now)

_(8.2)_ Per convention, add two files at the folder `./mapping-templates`;
`Query.getMyProfile.request.vtl`, `Query.getMyProfile.response.vtl` . Realize
how it matches `mappingTemplates:type&field`. Use the info in these two AWS docs
to configure the `vtl` files
[1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),
[2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html):

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
> ([1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),[2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html)).
> Therefore , instead of unit, he recommends to focus on testing e2e.

### 9 & 10 E2e test `getMyProfile` query

As a signed in user, make a graphQL request with the query `getMyProfile`.

- Sign in
- Make a graphQL request with the query
- Confirm that the returned profile is in the shape of the query.

Check out `__tests__/e2e/user-profile.test.js`.

> Make sure to clean up
> [DDB](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#item-explorer?initialTagKey=&table=appsyncmasterclass-backend-dev-UsersTable-YMVROSIOQDW5)
> and
> [CognitoUserPool](https://eu-west-1.console.aws.amazon.com/cognito/users/?region=eu-west-1#/pool/eu-west-1_LYIK8FuXA/users?_k=zqpvnh)
> at the end of the e2e test, do not delete your user which is used in AppSync
> console tests.

### Getting the GraphQL API_URL with `serverless-manifest-plugin`

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
`manifest.json` file, looks for
outputs/OutpuKey/GraphQlApiUrl`and puts it into the`.env` file.

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
`expressionValues`, they will all be
$context.arguments.newProfile`because of our GraphQL schema that was defined. Add a`condition` `"expression"
: "attribute_exists(id)"`, so if the user's id does not exist, the operation
fails.

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
    environment: # (15.2)
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

// [15.2] Implement the lambda function. We need to make a `putObject` request to S3.
// From the graphQL schema `getImageUploadUrl(extension: String, contentType: String)` ,
/// we know that we need an extension and contentType as args, both of which are optional.
/// We can get them from `event.arguments`.
// For S3 `putObject` we need `key`, `contentType` and the bucket env var.
const S3 = require('aws-sdk/clients/s3')
// when creating urls for the user to upload content, use S3 Transfer Acceleration
const s3 = new S3({useAccelerateEndpoint: true})
const {ulid} = require('ulid')

const handler = async event => {
  // (15.2.1) construct the key for S3 putObject request
  // use ulid to create a randomized, but sorted id (chance is not sorted when we create multiple ids)
  const id = ulid()
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

  // (15.2.2) get the contentType from event.arguments.contentType
  // get the contentType from graphQL schema as well, it is optional so we give it a default value
  const contentType = event.arguments.contentType || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    throw new Error('contentType must start be an image')
  }

  // (15.3) use S3 to upload an image to S3. The operation is `putObject`
  const params = {
    Bucket: process.env.BUCKET_NAME, // (15.2.3) get the bucket env var (settings in serverless.yml file)
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

_(17.2)_ Create a lambda resolver to generate a tweet `ulid`, write to
`TweetsTable`, `TimelinesTable` and update `UsersTable`.

_(17.2.0)_ Add the mapping template to `mappingTemplates`, we need resolvers
when we are transacting with DDB. We want AppSync to invoke the lambda function
directly without going through a custom mapping template.

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
const {ulid} = require('ulid')
const {TweetTypes} = require('../lib/constants')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument text - tweet(text: String!): Tweet!
  // we can extract that from event.arguments
  const {text} = event.arguments
  // we can get the username from event.identity.username (Lumigo and before in (13.2.1) )
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid()
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
the integration test, but we can verify the response from the mutation.

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

In _(15.0)_ we created a table for the tweets, and we identified a
`GlobalSecondaryIndex` called `byCreator`. We will be using it now. We utilize
the mapping template reference for DDB at
[1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),
[2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html).
We can get userId (the first argument of the query) by
` $util.dynamodb.toDynamoDBJson($context.arguments.userId)`. For the 2nd
argument, `nextToken`, we can similarly use
`$util.toJson($context.arguments.nextToken)`. `scanIndexForward` is synonymous
to ascending order (latest tweet last), we want latest tweet first so this is
set to `false`. We limit the number of tweets returned to be less than 25.

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
> Think of its as a utility to avoid over-fetching.
>
> We need nested resolvers when our types are returning other types.
>
> Oftentimes when we need to return another type, e.g. a Parent type might have
> a children property of type [Person]. A Customer type might have an orders
> array of type [Order].
>
> In all these examples, it's a relationship, which we can avoid eagerly loading
> the related item unless the caller asks for them.

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

We are going to get the timeline from DDB `timelinesTable`, therefore we need
theusual Appsync mapping-template yml and the vtl files query request and
response.

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

_(23.1)_ Add the .vtl files under `./mapping-templates/` for the request and
response. We utilize the mapping template reference for DDB at
[1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html),
[2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html).
Very similar to (20.1). `userId` instead of `creatorId`, and the current user is
the value which we get from `$context.identity.username`. We do not need
`"index" : "byCreator"`. The response is identical to 20.1 as well.

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

After we fetch the tweetId for the tweets on our timeline, we have to hydrate
them from the Tweets table. We can use pipeline functions for that. Pipeline
functions tell AppSync to perform multiple steps for a resolver; get a page of
tweets from the timelines table and hydrate them by doing a batch get against
Tweets table. But for now we can play with the types at `schema.api.graphql`.
_(23.2)_ Add a type `UnhydratedTweetsPage` and make `getMyTimeline` return a
`UnhydratedTweetsPage` instead of `TweetsPage`.

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

_(23.3)_ Now we have a type `UnhydratedTweetsPage`, and a `tweets` field we can
attach a nested resolver to. We can have that resolver hydrate the data from a
different table. Create a nested resolver that uses the `tweets` field of the
type `UnhydratedTweetsPage`, to be used to get data from `tweetsTable`.

_(23.4)_ For the nested resolver to work we need another set of `vtl` files
under `mapping-templates/`.

- We will have access to a list of tweets from Timelines table, which has userId
  and tweetId.
- We can use the tweetId to fetch the tweets from the Tweets table.
- We are going the take the source tweets array from the `UnhydratedTweetsPage`,
  which are the items that we would fetch from Timelines table
  `tweets: [ITweet!]`, extract the tweet id into an array of tweets with just
  the id, Json serialize it, pass it to the BatchGetItem operation.

To add each tweet object into the array, use
`$tweets.add($util.dynamodb.toMapValues($tweet))`. We have to use `$util,qr` to
ignore the return value of the `$tweets.add` operation, otherwise the vtl
interpreter will fail.

For the `tables` > TweetsTable > keys, after we're done populating the tweets
array use `$util.toJson($tweets)` to serialize it.

_(23.5)_ We need the value of the TweetsTable we are going to BatchGetItem from.
To get this value we add a block to the `serverless.appsync-api.yml`

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

The unit test for `getMyTimeline` would be duplicating the `getTweets`, because
the vtl templates are near identical.

We can write a test for `UnhydratedTweetsPage.tweets.request.vtl` since there is
plenty going on there.

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

Add some logic to our request template `Tweet.profile.request.vtl` to check what
fields the query is actually asking for. If it is only asking for the for the
id, return early without making a request to DDB.

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

- Increment the like count in the Users table.
- For the tweet, in Tweetstable increment the number of likes received.
- Introduce a new table (LikesTable) for which user has liked which tweet, and
  update that too.

_(26.0)_ create a new DDB table to track which user has liked which tweet.

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

We have to update 3 tables when the like mutation happens. We can do this in a
DDB transaction. (In _(17.1)_ we also updated 3 tables, but used a lambda
resolver because we had to generate a `ulid`). As usual, we have to create a
mapping template, dataSource and `vtl` files.

In the vtl files we will:

- Create an entry in LikesTable with `userId` and `tweetId`.
- Update TweetsTable with `tweetId`.
- Update UsersTable with `userId`.

_(26.1)_ Create a mapping template for `like`, dataSource for `likesTable` and
for `likeMutation` . When we need to do multiple transactions in an AppSync
resolver, we need to create a dataSource for the mutation (`likeMutation`). When
we want to use refer to the resources in a vtl file with ${resourceName}, we
need to add it to the substitutions.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # (26.1) setup an AppSync resolver to update 3 tables when like happens:
  # UsersTable, TweetsTable, LikesTable.
  - type: Mutation
    field: like
    dataSource: likeMutation

dataSources:
 - type: AMAZON_DYNAMODB
    name: likesTable # (26.1) define a data source for the mutation
    config:
      tableName: !Ref LikesTable
  # (26.1) we need the like mutation to create an entry in the LikesTable
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
  # (26.1) when we want to use refer to the resources in a vtl file with ${resourceName},
  # we need to add it to the substitutions
  LikesTable: !Ref LikesTable
  UsersTable: !Ref UsersTable

```

_(26.2)_ Create the `vtl` files.

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

Grab a `tweetId` from `TweetsTable`, create an AppSync mutation to like the
tweet.

![like-mutation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/fn1hebhj1qp65nqhlql5.png)

After the like, the `LikesTable` should
populate.![likes-table](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qvcdtgayse3i4a5tc958.png)

### 27 Implement `Tweet.liked` nested resolver

We can now implement the `liked: Boolean!` since we have the like mutation. It
is going to be nested resolver as in `Tweet.profile`

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

_(27.0)_ Create a nested resolved for `liked ` field.

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

_(27.1)_ Create vtl files `liked` request and response.

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

GraphQL fragments is a utility to reduce duplication in queries. Check out
`test-helpers/graphql.js`, `test-helpers/graphql-fragments.js`,
`__tests__/e2e/tweet-e2e.test.js`.

### 29 E2e Tests for `like` mutation

We want to update a tweet to `liked` and verify that. Try to like a 2nd time,
get an error. Check out `__tests__/e2e/tweet-e2e.test.js`.

## 30 Implement `unlike` mutation

Unlike implementation is the reverse of like.

```
type Mutation {
  like(tweetId: ID!): Boolean!
  unlike(tweetId: ID!): Boolean!
```

_(30.0)_ Create a mapping template for `unlike`, dataSource for
`unlikeMutation`. When we need to do multiple transactions in an AppSync
resolver, we need to create a dataSource for the mutation AND we already have
the dataSource for `likesTable` from 26.1. When we want to use refer to the
resources in a vtl file with ${resourceName}, we need to add it to the
substitutions, and we already have the `LikesTable` in the substitutions from
(26.1).

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

_(26.2)_ Create the `vtl` files.

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

We want to update a tweet to `liked` and verify that. Try to like a 2nd time,
get an error. Check out `__tests__/e2e/tweet-e2e.test.js`.

## 32 Implement `getLikes` query

`getLikes` is very similar to `getMyTimeline` (23); the schemas are the same
with `userId` as the partition key, and `tweetId` as sort key. To get the tweets
that a user likes, we just need to query the `LikesTable` against the user's
`userId`. We have the same challenge we had in (23) with `getMyTimeline`; we
don't have everything about the tweet itself and we need to hydrate it
afterward.

![32-beginning](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vxd0ofgqvuco7voxc46h.png)

We can use the same trick in (23); instead of returning a `TweetsPage`, we can
return a `UnhydratedTweetsPage`. After we fetch the tweetId for the tweets on
our timeline, we can hydrate them from the Tweets table.

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

_(32.1)_ Add the mapping template.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # (32.1) add an entry to the mappingTemplates
  - type: Query
    field: getLikes
    dataSource: likesTable
```

_(32.2)_ Add the `vtl` files for `Query.getLikes.request.vtl` and
`Query.getLikes.response.vtl`. These will be similar to `getMyTimeline` in (23).

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

`getLikes` query is similar to `getMyTimeline` query (24), the only distinction
is that we need to reflect the arguments at the schema.

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

> When do we need nested resolvers?
>
> Think of its as a utility to avoid over-fetching.
>
> We need nested resolvers when our types are returning other types.

In this case we only want to query the `tweets` field of a `IProfile`
(`MyProfile`, `OtherProfile`).

_(34.0)_ Create a nested resolver for MyProfile.tweet.

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

_(34.1)_ Add the `vtl` files. These are similar to `getTweets` (20).

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

For testing we have to be careful about an infinite loop situation when querying
or mutation `myProfileFields`. `MyProfile.tweet` returns a `TweetsPage`, which
in turn returns a `tweets` field, which in turn returns an `ITweet`, which in
turn returns another `IProfile`.

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

Make sure to not include `tweets` in `myProfileFragment ` being used in e2e
tests

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

Instead, add `tweets` field to only to `getMyProfile` and `editMyProfile` . This
way when we make the calls, we're going to get the first page of tweets back.
But, when we fetch the profiles for these tweets, it will not go into an
infinite loop.

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

_(35.0)_ create a new DDB table to track which user has retweeted which tweet.
Similar to (26.0)

_(35.1)_ We need to add an entry to the `TweetsTable` for the retweet, which
means we need a tweetId, which is a `ulid` and requires us to use a lambda
resolver. Similar to (17.2). `retweet` function will need the additional
`iamRoleStatemements`.

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

_(35.2)_ add a mapping template for the retweet mutation. Similar to (17.2.0),
we want AppSync to invoke the lambda function directly without going through a
custom mapping template.

_(35.3)_ Define a data source for the mutation

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

_(35.4)_ Create the lambda function for retweet. Similar to (17.2.2).

- Get from Tweets,
- Write to Tweets, Timelines, Retweets
- Update Tweets and Users

```js
// (35.4) add the lambda function that will
// Get from Tweets, write to Tweets, Timelines, Retweets, Update Tweets and Users
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const {ulid} = require('ulid')
const {TweetTypes} = require('../lib/constants')

const {USERS_TABLE, TIMELINES_TABLE, TWEETS_TABLE, RETWEETS_TABLE} = process.env

const handler = async event => {
  // we know from graphQL schema the argument retweet - retweet(tweetId: ID!): Boolean!
  // we can extract that from event.arguments
  const {tweetId} = event.arguments
  // we can get the username from event.identity.username
  const {username} = event.identity
  // generate a new ulid & timestamp for the tweet
  const id = ulid()
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

_(36.0)_ Create a nested resolver to get the profile on Retweet. We need the
profile field, and we already have the vtl files for that in (20.3) for
`getTweets`.

_(36.1)_ Create a nested resolver to fetch the retweeted tweet on Retweet

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

_(36.2)_ Create the `vtl` files for `Retweet.retweetOf.request` and `response`.

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
- Feed it to the handler (the handler causes writes and updates to 4 DDB tables,
  hence the "integration")
- Check that the result matches the expectation (by reading the 4 tables from
  DDB, hence "integration")

We have to have a real user for this integration test, but it is still an
integration test given that we are feeding an event object to the handler.

Check out `__tests__/integration/retweet-self-integration.test.js`,
`__tests__/integration/retweet-other-integration.test.js`.

### 38 E2e test for retweet mutation

_(38.0)_ When a user reweets their own tweet, and get their tweets, we want to
get the information about the retweet (reweetOf). The `retweeted` boolean is on
the `type Tweet`, so we need to add a nested resolver for that.

(38.1) To enable that, although this is the test section, we added to the
`serverless.appsync-api.yml` to increase retweet capabilities, and we added 2
vtl files. Reweets are similar to likes.

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

_(39.0)_ add a mapping template for the unretweet mutation. Similar to (35.2)
retweet mutation and (17.2.0) tweet mutation, we want AppSync to invoke the
lambda function directly without going through a custom mapping template.

_(39.1)_ Define a data source for the mutation (similar to 35.3)

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

_(39.2)_ Add the lambda function to `serverless.yml`, similar to (35.1).

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

- Delete the tweet from the TweetsTable, the RetweetsTable, and the
  TimelinesTable if it's not the same user
- Decrement the count on the UsersTable and the TweetsTable

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

- Create an event: an object which includes `identity.username` and
  `arguments.tweetId`.
- Feed it to the handler (the handler causes writes and updates to DDB, hence
  the "integration")
- Check that the result matches the expectation (by reading the 4 tables from
  DDB, hence "integration")

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

_(42.0)_ add a mapping template for the reply mutation. Similar to (35.2)
(39.0).

When replying we have to generate a new tweet, create an id for it (ulid)
therefore we need a lambda function.

_(42.1)_ Define a data source for the mutation

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

_(42.2)_ Add the lambda function to `serverless.yml`. Similar to (35.1) retweets
without the retweet table.

- Get from Tweets
- Update Tweets and Users
- Write to Tweets, Timelines

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

- Get from Tweets

- Update Tweets and Users

- Write to Tweets, Timelines

```js
// functions/reply.js

// (42.3) add the lambda function that will
// * Get from Tweets
// * Update Tweets and Users
// * Write to Tweets, Timelines
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const {ulid} = require('ulid')
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
  const id = ulid()
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

- Create an event: an object which includes `identity.username` and
  `arguments.tweetId` and `arguments.text`.
- Feed it to the handler (the handler causes writes and updates to DDB, hence
  the "integration")
- Check that the result matches the expectation (by reading the 3 tables from
  DDB, hence "integration")

Check out `__tests__/integration/reply.test.js`.

## 44 Implement reply nested resolvers `profile`, `inReplyToTweet`, `inReplyToUsers`

In reply we have 3 properties that are a type of interfaces:

```
  profile: IProfile!
  inReplyToTweet: ITweet!
  inReplyToUsers: [IProfile!]
```

As explained in _(20.2)_, we need nested resolvers when our types are returning
other types.

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

_(44.0)_ Create a nested resolver to get the profile on Reply. Similar to (36.0)
Retweet.profile.

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

_(44.1)_ Create a nested resolver to get the inReplyToUsers on Reply, similar to
(36.1) Retweet.retweetOf.

```yml
mappingTemplates:
  - type: Reply
    field: inReplyToTweet
    dataSource: tweetsTable
```

_(44.3)_ Create the `vtl` files `Reply.inReplyToTweet.request.vtl`,
`Reply.inReplyToTweet.response.vtl`, these are very similar to (36.2) Retweet
nested resolvers.

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

_(44.4)_ Create a nested resolver to get the inReplyToUsers on Reply.

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

_(44.5)_ Create the `vtl` files `Reply.inReplyToUsers.request.vtl` and
`Reply.inReplyToUsers.response.vtl`.

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

Arrange: UserA tweet, UserB reply

Action: call getTweets or getMyTimeline

Assert: see the reply

Check out `__tests__/e2e/tweet-e2e.test.js`

## 47 Implement follow mutation

_(47.0)_ We need a relationships table to track which user follows/blocks/etc
who. Add a `RelationshipsTable` to `serverless.yml`.

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

_(47.1)_ add a mapping template for follow mutation. Follow will use
`vtl`templates.

_(47.2)_ add a data source for the follow mutation - write to
RelationshipsTable, update UsersTable. Also add a data source for relationships
table

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

_(47.3)_ Create the vtl files for `Mutation.follow.request.vtl` &
`Mutation.follow.response`.

When a userA follows userB, we write to RelationshipsTable, where userB is the
otherUserId.

![UserA-follows-UserB](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4j5o07zfyfbz5jn6xaky.png)

At userA and userB, we also increment followersCount & followingCount
accordingly. All these can be done in a transaction using vtl (it can be in a
lambda too btw, but vtl is cheaper).

> When do we use substitutions in `serverless.appsync-api.yml` ?
>
> Whenever we are using table names in vtl file, ex: `"${RelationshipsTable}" we
> have to define it in substitutions.

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

When userA views userB's profile, userA will see if they follow userB and if
userB is following them.

_(48.0)_ add nested resolvers for OtherProfile.following and
OtherProfile.followedBy.

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

(48.1) create the `vtl` files for `OtherProfile.following` and
`OtherProfile.followedBy`.

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

We are using the screen name and not user id for the sake of a nice url when
viewing another user's profile.

```
# schema.api.graphql

type Query {
	getProfile(screenName: String!): OtherProfile!
}
```

We need a way to get a user by screen name, and for that we need to add the
global secondary index to UsersTable.

_(49.0)_ add the mapping template for the getProfile query.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # ..
  # (49.0) add the mapping template for the getProfile query
  - type: Query
    field: getProfile
    dataSource: usersTable
```

_(49.1)_ Add `screenName` as global secondary index to `UsersTable`

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

_(49.2)_ add the `vtl` files

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

Arrange: userA follows userB

Act: userA views userBs profile

Assert: following: true, followedBy: false

After that, userB follows back userA, userA views userB again and followedBy
shows true.

Check out `__tests__/e2e/tweet-e2e.test.js`

## 51 Distribute tweets to followers

Add userA's tweet to their follower's timelines. We will use Dynamo Streams for
that.

_(51.0)_ enable Dynamo stream specification on tweets table, to use to trigger a
lambda function

```yml
# serverless.yml

resources:
  Resources:
    TweetsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: #
        KeySchema: #
        AttributeDefinitions: #
        GlobalSecondaryIndexes: #
        Tags: #
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES
```

_(51.1)_ Add a lambda function that will be triggered by the Dynamo stream.

```yml
# serverless.yml
distributeTweets:
  handler: functions/distribute-tweets.handler
  environment:
    RELATIONSHIPS_TABLE: !Ref RelationshipsTable
    TIMELINES_TABLE: !Ref TimelinesTable
  events: # lambda triggered by a stream event
    - stream:
        type: dynamodb
        arn: !GetAtt TweetsTable.StreamArn
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:PutItem
        - dynamodb:DeleteItem
        - dynamodb:BatchWriteItem
      Resource: !GetAtt TimelinesTable.Arn
    - Effect: Allow
      Action: dynamodb:Query
      Resource: !Sub '${RelationshipsTable.Arn}/index/byOtherUser'
```

_(51.2)_ add the lambda function to distribute tweets to followers.

In case of a DDB update (write/modify) we get both NewImage and OldImage of that
record in the DDB table.

In case of remove, OldImage tells us the record that was deleted.

In the case of an insert, the NewImage tests us the record that was added.

![DDB-stream-1](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wbdng6p18ssyjcl7gqwc.png)

```js
// functions/distribute-tweets.js

const _ = require('lodash')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const Constants = require('../lib/constants')

const {RELATIONSHIPS_TABLE, TIMELINES_TABLE} = process.env

const handler = async event => {
  // iterate through the array of Records, we only care about INSERT and REMOVE
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      // get the tweet object out of the NewImage, insert into follower timelines
      // unmarshall converts the DynamoDB record into a JS object
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
      // find the followers of the tweet creator
      const followers = await getFollowers(tweet.creator)
      // insert tweet into follower timelines
      await distribute(tweet, followers)
    } else if (record.eventName === 'REMOVE') {
      // do the opposite for remove
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)
      const followers = await getFollowers(tweet.creator)
      await undistribute(tweet, followers)
    }
  }
}
async function getFollowers(userId) {}

async function distribute(tweet, followers) {}

async function undistribute(tweet, followers) {}

module.exports = {handler}
```

### 52 Integration test for distribute-tweets function

- Create an event object (this time we are getting it from json files), and
  modify it to match the test case
- Feed it to the handler

- Check that the result matches the expectation

The main idea is that we invoke the lambda handler locally and pass an event
object to it. Shaping that object can be in any way; our own object or json, as
long as it looks like it's coming from DDB. We are asserting the result at DDB
level

Check out `__tests__/integration/distribute-tweets.test.js`

### 53 E2e test for distribute-tweets function

- Arrange: userA follows userB
- Act: userB tweets
- Assert: userB's tweet appears on userA's timeline

In contrast to the integration test where we performed the assertion by checking
the DB, now we are checking the response to getMyTimeline. This process happens
asynchronously, userB's tweet takes time to appear at userA's timeline. We need
to a utility to retry the check so that the test works more reliably. We
utilized async-retry library to do this.

## 54 Implement add tweets to timeline when following someone

_(54.0)_ add the lambda config and enable streams on the table it's streaming
from.

_(54.1)_ add a global secondary index for the tweets distributed from the
followed user.

```yml
# serverless.yml

functions:
  distributeTweetsToFollower:
    handler: functions/distribute-tweets-to-follower.handler
    environment:
      TWEETS_TABLE: !Ref TweetsTable
      TIMELINES_TABLE: !Ref TimelinesTable
      MAX_TWEETS: 100
    events:  # lambda triggered by a stream event
      - stream:
          type: dynamodb
          arn: !GetAtt RelationshipsTable.StreamArn
    iamRoleStatements:
      - Effect: Allow
        Action: dynamodb:Query
        Resource:
          - !Sub '${TweetsTable.Arn}/index/byCreator'
          - !Sub '${TimelinesTable.Arn}/index/byDistributedFrom'
      - Effect: Allow
        Action:
          - dynamodb:BatchWriteItem
          - dynamodb:PutItem
          - dynamodb:DeleteItem
        Resource: !GetAtt TimelinesTable.Arn

resources:
  Resources:
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
          # (54.1) add a global secondary index
          # for the tweets distributed from the followed user
          - AttributeName: distributedFrom
            AttributeType: S
        GlobalSecondaryIndexes:
          - IndexName: byDistributedFrom
            KeySchema:
              - AttributeName: userId
                KeyType: HASH
              - AttributeName: distributedFrom
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        Tags:
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: timelines-table

      RelationshipsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: userId
            KeyType: HASH
          - AttributeName: sk
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
        # (54.0) enable streams on the table it's streaming from.
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES
        Tags:
          - Key: Environment
            Value: ${self:custom.stage}
          - Key: Name
            Value: relationships-table
```

(54.2) Add the lambda function

Find the tweets for the user being followed. Insert the recent n tweets to
user's follower's timeline.

```js
// functions/distribute-tweets-to-follower.js

// (54.2) Add the lambda function
// Find the tweets for the user being followed.
// Insert the recent n tweets to user's follower's timeline.

const _ = require('lodash')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const DocumentClient = new DynamoDB.DocumentClient()
const Constants = require('../lib/constants')

const {TWEETS_TABLE, TIMELINES_TABLE, MAX_TWEETS} = process.env
const MaxTweets = parseInt(MAX_TWEETS)

module.exports.handler = async event => {
  // iterate through the array of Records, we only care about INSERT and REMOVE
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      // get the relationship object out of the NewImage
      // unmarshall converts the DynamoDB record into a JS object
      const relationship = DynamoDB.Converter.unmarshall(
        record.dynamodb.NewImage,
      )

      const [relType] = relationship.sk.split('_')
      if (relType === 'FOLLOWS') {
        // get the tweet object out of the NewImage, insert into follower timeline
        const tweets = await getTweets(relationship.otherUserId)
        await distribute(tweets, relationship.userId)
      }
    } else if (record.eventName === 'REMOVE') {
      // do the opposite for remove
      const relationship = DynamoDB.Converter.unmarshall(
        record.dynamodb.OldImage,
      )

      const [relType] = relationship.sk.split('_')
      if (relType === 'FOLLOWS') {
        const tweets = await getTimelineEntriesBy(
          relationship.otherUserId,
          relationship.userId,
        )
        await undistribute(tweets, relationship.userId)
      }
    }
  }
}
```

### 55 Integration test for add tweets to timeline when following someone

Similar to (52).

- Create an event object (again we are getting it from json files), and modify
  it to match the test case
- Feed it to the handler

- Check that the result matches the expectation

Again the main idea is that we invoke the lambda handler locally and pass an
event object to it. Shaping that object can be in any way; our own object or
json, as long as it looks like it's coming from DDB. We are asserting the result
at DDB level.

Check out `__tests__/integration/distribute-tweets-to-follower.test.js`

### 56 E2e test for add tweets to timeline when following someone

Covered by (53).

## 57 Implement unfollow mutation

_(57.0)_ add a mapping template for the unfollow mutation

_(57.1)_ add a data source for unfollow mutation.

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # MUTATIONS
  - type: AMAZON_DYNAMODB
    name: unfollowMutation
    config:
      tableName: !Ref RelationshipsTable
      iamRoleStatements:
        - Effect: Allow
          Action: dynamodb:DeleteItem
          Resource: !GetAtt RelationshipsTable.Arn
        - Effect: Allow
          Action: dynamodb:UpdateItem
          Resource: !GetAtt UsersTable.Arn

resources:
	Resources:

  - type: AMAZON_DYNAMODB
    name: unfollowMutation
    config:
      tableName: !Ref RelationshipsTable
      iamRoleStatements:
        - Effect: Allow
          Action: dynamodb:DeleteItem
          Resource: !GetAtt RelationshipsTable.Arn
        - Effect: Allow
          Action: dynamodb:UpdateItem
          Resource: !GetAtt UsersTable.Arn
```

_(57.2)_ Implement the `vtl` files `Mutation.unfollow.request.vtl` and
`Mutation.unfollow.response.vtl`

### 58 E2e test for unfollow mutation

Opposite of (50). Check out `__tests__/e2e/tweet-e2e.test.js`.

## 59 Implement getFollowers query

(59.0) add a query for getFollowers. Configure the pipeline resolver and the
(59.1) pipeline functions (they are not lambdas).

https://docs.aws.amazon.com/appsync/latest/devguide/pipeline-resolvers.html

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # QUERIES
  - type: Query
    field: getFollowers
    kind: PIPELINE # configure the pipeline resolver
    functions: # the pipeline fns we will call in order
      - getFollowers
      - hydrateFollowers
    request: simplePipeline.request.vtl
    response: simplePipeline.response.vtl

functionConfigurations:
  - name: getFollowers
    dataSource: relationshipsTable
  - name: hydrateFollowers
    dataSource: usersTable
```

(59.2) Add `vtl` files :

- `getFollowers.request.vtl` & `getFollowers.response.vtl`
- `hydrateFollowers.request.vtl` & `hydrateFollowers.response.vtl`
- `simplePipeline.request.vtl` & `simplePipeline.response.vtl`

### 61 Unit test hydrateFollowers.request template

- Create an AppSync context
- Get the template
- Render the template (using the utility npm packages)

Check out `__tests__/unit/hydrateFollowers.request.test.js`.

### 62 E2e test getFollowers query

Check out `__tests__/e2e/tweet-e2e.test.js`

## 63 Implement getFollowing query

(63.0) add a query for getFollowers. Configure the pipeline resolver and the
(63.1) pipeline functions (they are not lambdas).

```yml
# serverless.appsync-api.yml

mappingTemplates:
  # QUERIES
  - type: Query
    field: getFollowing
    kind: PIPELINE # configure the pipeline resolver
    functions: # the pipeline fns we will call in order
      - getFollowing
      - hydrateFollowing
    request: simplePipeline.request.vtl
    response: simplePipeline.response.vtl

functionConfigurations:
  - name: getFollowers
    dataSource: relationshipsTable
  - name: hydrateFollowers
    dataSource: usersTable
```

(63.2) Add `vtl` files :

- `getFollowing.request.vtl` & `getFollowing.response.vtl`
- `hydrateFollowing.request.vtl` & `hydrateFollowing.response.vtl`

## 64 Sync users and tweets to Algolia

(Signed up at Algolia, created 2 indexes users_dev and tweets_dev, noted down
the SearchOnly and Admin api keys)

We need to get all our DDB data into Algolia so that we can search them.

(65.1) Listen in on the stream of events from tweets & users tables, then sync
the updates to Algolia. Similar to `distributeTweets` at (51)

```yml
# serverless.yml

functions:
  ###
  # (64.1) Listen in on the stream of events from tweets & users tables,
  #then sync the updates to Algolia.
  syncUsersToAlgolia:
    handler: functions/sync-users-to-algolia.handler
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt UsersTable.StreamArn
    environment:
      ALGOLIA_APP_ID: xxx
      ALGOLIA_WRITE_KEY: xxx
  # (64.1)
  syncTweetsToAlgolia:
    handler: functions/sync-tweets-to-algolia.handler
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt TweetsTable.StreamArn
    environment:
      ALGOLIA_APP_ID: xxx
      ALGOLIA_WRITE_KEY: xxx
```

(65.2) Create the lambda handlers for sync (users shown, tweets is the mirror)

```js
// lib/algolia.js
// (65.2) Create the lambda handlers for Algolia sync
const algoliasearch = require('algoliasearch')

// do not initialize the index on every lambda invocation
let usersIndex, tweetsIndex

const initUsersIndex = async (appId, key, stage) => {
  if (!usersIndex) {
    // on cold start initialize the index
    const client = algoliasearch(appId, key)
    usersIndex = client.initIndex(`users_${stage}`)
    // configure the index (just search by name and screenName)
    await usersIndex.setSettings({
      searchableAttributes: ['name', 'screenName'],
    })
  }

  return usersIndex
}

const initTweetsIndex = async (appId, key, stage) => {
  if (!tweetsIndex) {
    const client = algoliasearch(appId, key)
    tweetsIndex = client.initIndex(`tweets_${stage}`)
    await tweetsIndex.setSettings({
      searchableAttributes: ['text'],
      // return the most recent tweet on top in search results
      customRanking: ['desc(createdAt)'],
    })
  }

  return tweetsIndex
}

module.exports = {
  initUsersIndex,
  initTweetsIndex,
}
```

```javascript
// functions/sync-users-to-algolia.js

// (65.2) Create the lambda handlers for Algolia sync
// Similar to distributeTweets (51.1)
const {initUsersIndex} = require('../lib/algolia')
const DynamoDB = require('aws-sdk/clients/dynamodb')

const {STAGE, ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY} = process.env

module.exports.handler = async event => {
  // initialize the Algolia index
  const index = await initUsersIndex(ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY, STAGE)

  for (const record of event.Records) {
    // whenever data is inserted or updated
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      // get the information of the profile (unmarshall converts the DynamoDB record into a JS object)
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
      // a record in Algolia needs a unique ID, we just make up one
      profile.objectID = profile.id
      // save the record to Algolia
      await index.saveObjects([profile])
    } else if (record.eventName === 'REMOVE') {
      // whenever data is removed, delete it from Algolia
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)

      await index.deleteObjects([profile.id])
    }
  }
}
```

## 65 Securely handle secrets

- The function knows the name of the parameters.

- At run time, during cold start, the functions acquires params from SSM and
  decrypts using IAM credentials.

- The function caches the parameters, because we don't want to hit SSM on every
  invocation. Also, we invalidate the cache ever x minutes because in the event
  of a API key rotation, we do not want to redeploy all the functions that
  depend on the secrets.

- The function does not put the parameters back into the env vars, because
  that's a target for attackers. Instead puts them into the execution context
  object.

- The function checks against the SSM parameter store every x minutes for new
  param values. If there are no new values, it uses the cached ones.

- Middy has 2 middleware `secretsManager` and `ssm` that help with this.

![secret](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/l3c9esj8arepjprtehlk.png)

(65.0) Add the 2 api keys in the AWS Systems Manager (SSM) > Parameter Store:
`/dev/algolia-app-id` and `/dev/algolia-admin-key`.

![algolia](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/izlatbp0re5qogreqc23.png)

![AWS-SSM](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/gx4doyylfvvjblaakfpn.png)

![AWS-SSM2](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/8lxo6cjeap2xd8mehsrn.png)

(65.1) Instead of using plain env vars, get the values from AWS SSM Parameter
Store

```yml
# serverless.yml

functions:
  ###

  # (64.1) Listen in on the stream of events from tweets & users tables, then sync the updates to Algolia. Similar to distributeTweets (51.1)
  syncUsersToAlgolia:
    handler: functions/sync-users-to-algolia.handler
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt UsersTable.StreamArn
    # [65] Securely handle secrets
    # (65.1) instead of using plain env vars, get the values from AWS SSM Parameter Store
    iamRoleStatements:
      - Effect: Allow
        Action: ssm:GetParameters
        Resource:
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-app-id
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-admin-key

  # (64.1)
  syncTweetsToAlgolia:
    handler: functions/sync-tweets-to-algolia.handler
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt TweetsTable.StreamArn
    # [65] Securely handle secrets
    # (65.1) instead of using plain env vars, get the values from AWS SSM Parameter Store
    iamRoleStatements:
      - Effect: Allow
        Action: ssm:GetParameters
        Resource:
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-app-id
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-admin-key
```

(65.2) Use Middy SSM middleware to fetch the parameters and cache them. We use
`setToContext` to add the env vars to the context object instead of env vars.
`yarn add -D @middy/core @middy/ssm`. (Update sync-tweets-to-algolia and
sync-users-to-algolia).

```javascript
// functions/sync-tweets-to-algolia.js
// (64.2) Create the lambda handlers for Algolia sync
const DynamoDB = require('aws-sdk/clients/dynamodb')
const middy = require('@middy/core')
const ssm = require('@middy/ssm')
const {initTweetsIndex} = require('../lib/algolia')
const {TweetTypes} = require('../lib/constants')

const {STAGE} = process.env

// (65.2) Use Middy SSM middleware to fetch the parameters and cache them.
// We use `setToContext` to add the env vars to the context object instead  of env vars
module.exports.handler = middy(async (event, context) => {
  // initialize the Algolia index
  const index = await initTweetsIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      // get the information of the profile (unmarshall converts the DynamoDB record into a JS object)
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)

      if (tweet.__typename === TweetTypes.RETWEET) {
        // if it's a retweet, we don't want to index it
        continue
      }
      // a record in Algolia needs a unique ID, we just make up one
      tweet.objectID = tweet.id
      // save the record to Algolia
      await index.saveObjects([tweet])
    } else if (record.eventName === 'REMOVE') {
      // whenever data is removed, delete it from Algolia
      const tweet = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)

      if (tweet.__typename === TweetTypes.RETWEET) {
        // if it's a retweet, we don't want to index it
        continue
      }

      await index.deleteObjects([tweet.id])
    }
  }
}).use(
  ssm({
    cache: true,
    cacheExpiryInMillis: 5 * 60 * 1000, // 5 mins
    names: {
      ALGOLIA_APP_ID: `/${STAGE}/algolia-app-id`,
      ALGOLIA_WRITE_KEY: `/${STAGE}/algolia-admin-key`,
    },
    setToContext: true,
    throwOnFailedCall: true,
  }),
)
```

```javascript
// functions/sync-users-to-algolia.js
// (64.2) Create the lambda handlers for Algolia sync
// Similar to distributeTweets (51.1)
const DynamoDB = require('aws-sdk/clients/dynamodb')
const {initUsersIndex} = require('../lib/algolia')
const middy = require('@middy/core')
const ssm = require('@middy/ssm')

const {STAGE} = process.env

// (65.2) Use Middy SSM middleware to fetch the parameters and cache them.
// We use `setToContext` to add the env vars to the context object instead  of env vars
module.exports.handler = middy(async (event, context) => {
  // initialize the Algolia index
  const index = await initUsersIndex(
    context.ALGOLIA_APP_ID,
    context.ALGOLIA_WRITE_KEY,
    STAGE,
  )

  for (const record of event.Records) {
    // whenever data is inserted or updated
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      // get the information of the profile (unmarshall converts the DynamoDB record into a JS object)
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
      // a record in Algolia needs a unique ID, we just make up one
      profile.objectID = profile.id
      // save the record to Algolia
      await index.saveObjects([profile])
    } else if (record.eventName === 'REMOVE') {
      // whenever data is removed, delete it from Algolia
      const profile = DynamoDB.Converter.unmarshall(record.dynamodb.OldImage)

      await index.deleteObjects([profile.id])
    }
  }
}).use(
  ssm({
    cache: true,
    cacheExpiryInMillis: 5 * 60 * 1000, // 5 mins
    names: {
      ALGOLIA_APP_ID: `/${STAGE}/algolia-app-id`,
      ALGOLIA_WRITE_KEY: `/${STAGE}/algolia-admin-key`,
    },
    setToContext: true,
    throwOnFailedCall: true,
  }),
)
```

## 66 Add Search query to GraphQL schema

```
# schema.api.graphql

type Query {
  getImageUploadUrl(extension: String, contentType: String): AWSURL!
   getMyTimeline(limit: Int!, nextToken: String): UnhydratedTweetsPage!
  getMyProfile: MyProfile!
  getProfile(screenName: String!): OtherProfile
  getTweets(userId: ID!, limit: Int!, nextToken: String): TweetsPage!
  getLikes(userId: ID!, limit: Int!, nextToken: String): UnhydratedTweetsPage!
  getFollowers(userId: ID!, limit: Int!, nextToken: String): ProfilesPage!
  getFollowing(userId: ID!, limit: Int!, nextToken: String): ProfilesPage!
  # (66) Add Search query to GraphQL schema
  search(
    query: String!
    mode: SearchMode!
    limit: Int!
    nextToken: String
  ): SearchResultsPage!
}

# (66) Add Search query to GraphQL schema
enum SearchMode {
  Top
  Latest
  People
  Photos
  Videos
}

# (66) Add Search query to GraphQL schema
union SearchResult = MyProfile | OtherProfile | Tweet | Reply
type SearchResultsPage {
  results: [SearchResult!]
  nextToken: String
}
```

## 67 Implement search query

![search-query](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/fmo9d06o71kbo6gd8kdb.png)

We need a lambda function to query Algolia, as opposed to using vtl.

Like the usual:

- Add the lambda function to `serverless.yml` (67.0)
- Add the mapping template (GQL query) to `serverless.appsync.yml` and the
  dataSource (67.1)
- Add the JS for the lambda function. (67.2)

(67.0) Add the lambda function to `serverless.yml`:

```yml
# serverless.yml

functions:
  ##
  search:
    handler: functions/search.handler
    iamRoleStatementsName: ${self:service}-${self:custom.stage}-search
    iamRoleStatements:
      - Effect: Allow
        Action: ssm:GetParameters
        Resource:
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-app-id
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-admin-key
```

(67.1) Add the mapping template (GQL query) to `serverless.appsync.yml` and the
dataSource:

```yml
# serverless.appsync-api.yml

mappingTemplates:
  ##
  - type: Query
    field: search
    dataSource: searchFunction
    request: false
    response: false

dataSources:
  ##
  - type: AWS_LAMBDA
    name: searchFunction
    config:
      functionName: search
```

(67.2) Add the JS for the lambda function. Check out functions/search.js.

### 68 E2e test search query

State: a user tweets and replies to their tweet

Action: User searches people (by id & name) and searches tweets (by text &
replyText)

Check out `__tests__/e2e/search-e2e.test.js`.

## 69 Add getHashTag query to GraphQL schema

```
# schema.api.graphql

type Query {
  getImageUploadUrl(extension: String, contentType: String): AWSURL!
   getMyTimeline(limit: Int!, nextToken: String): UnhydratedTweetsPage!
  getMyProfile: MyProfile!
  getProfile(screenName: String!): OtherProfile
  getTweets(userId: ID!, limit: Int!, nextToken: String): TweetsPage!
  getLikes(userId: ID!, limit: Int!, nextToken: String): UnhydratedTweetsPage!
  getFollowers(userId: ID!, limit: Int!, nextToken: String): ProfilesPage!
  getFollowing(userId: ID!, limit: Int!, nextToken: String): ProfilesPage!
  # (66) Add Search query to GraphQL schema
  search(
    query: String!
    mode: SearchMode!
    limit: Int!
    nextToken: String
  ): SearchResultsPage!
  # [69] Add getHashTag query to GraphQL schema
  getHashTag(
    hashTag: String!
    mode: HashTagMode!
    limit: Int!
    nextToken: String
  ): HashTagResultsPage!
}

# (66) Add Search query to GraphQL schema
enum SearchMode {
  Top
  Latest
  People
  Photos
  Videos
}

# Add getHashTag query to GraphQL schema
enum HashTagMode {
  Top
  Latest
  People
  Photos
  Videos
}

# (66) Add Search query to GraphQL schema
union SearchResult = MyProfile | OtherProfile | Tweet | Reply
type SearchResultsPage {
  results: [SearchResult!]
  nextToken: String
}

# (69) Add getHashTag query to GraphQL schema
union HashTagResult = MyProfile | OtherProfile | Tweet | Reply
type HashTagResultsPage {
  results: [HashTagResult!]
  nextToken: String
}
```

## 70 Implement getHashTag Query

Like the usual:

- Add the lambda function to `serverless.yml` (70.0)
- Add the mapping template (GQL query) to `serverless.appsync.yml` and the
  dataSource (70.1)
- Add the JS for the lambda function. (70.2)

(70.0) Add the lambda function to `serverless.yml`:

```yml
# serverless.yml

functions:
  ##
  getHashTag:
    handler: functions/get-hash-tag.handler
    iamRoleStatements:
      - Effect: Allow
        Action: ssm:GetParameters
        Resource:
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-app-id
          - !Sub arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${self:custom.stage}/algolia-admin-key
```

(70.1) Add the mapping template (GQL query) to `serverless.appsync.yml` and the
dataSource:

```yml
# serverless.appsync-api.yml

mappingTemplates:
  ##
  - type: Query
    field: getHashTag
    dataSource: getHashTagFunction
    request: false
    response: false

dataSources:
  ##
  - type: AWS_LAMBDA
    name: getHashTagFunction
    config:
      functionName: getHashTag
```

(70.2) Add the JS for the lambda function. Check out functions/get-hash-tag.js.

### 71 E2e test getHashTag query

Check out `__tests__/e2e/search-hashtag.e2e.test.js`.

## 73 Add subscriptions to GraphQL schema

We do not want clients to poll AppSync for notifications. Instead we want the
backend to push data to the clients when there is data to be sent. We implement
this with GraphQL subscriptions which allow clients to subscribe to data change
events.

![subscriptions](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ymxjt3osgk51t3fq2944.png)

- (73.0) Define a top level subscription type
- (73.1) add the mutations for the subscription type
- (73.2) define the subscription types

```yml
# schema.api.graphql

schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}

type Mutation {
  ##

  # (73.1) add the mutations for the subscription type
  notifyRetweeted(
    id: ID!
    userId: ID!
    tweetId: ID!
    retweetedBy: ID!
    retweetId: ID!
  ): Notification! @aws_iam

  notifyLiked(id: ID!, userId: ID!, tweetId: ID!, likedBy: ID!): Notification!
    @aws_iam

  notifyMentioned(
    id: ID!
    userId: ID!
    mentionedBy: ID!
    mentionedByTweetId: ID!
  ): Notification! @aws_iam

  notifyReplied(
    id: ID!
    userId: ID!
    tweetId: ID!
    replyTweetId: ID!
    repliedBy: ID!
  ): Notification! @aws_iam
}
# (73.0) Define a top level subscription type
type Subscription {
  onNotified(userId: ID!, type: NotificationType): Notification
    @aws_subscribe(
      mutations: [
        "notifyRetweeted"
        "notifyLiked"
        "notifyMentioned"
        "notifyReplied"
      ]
    )
}

# (73.2) define the subscription types
type Retweeted implements iNotification @aws_iam @aws_cognito_user_pools {
  id: ID!
  type: NotificationType!
  userId: ID!
  tweetId: ID!
  retweetedBy: ID!
  retweetId: ID!
  createdAt: AWSDateTime!
}

type Liked implements iNotification @aws_iam @aws_cognito_user_pools {
  id: ID!
  type: NotificationType!
  userId: ID!
  tweetId: ID!
  likedBy: ID!
  createdAt: AWSDateTime!
}

type Mentioned implements iNotification @aws_iam @aws_cognito_user_pools {
  id: ID!
  type: NotificationType!
  userId: ID!
  mentionedBy: ID!
  mentionedByTweetId: ID!
  createdAt: AWSDateTime!
}

type Replied implements iNotification @aws_iam @aws_cognito_user_pools {
  id: ID!
  type: NotificationType!
  userId: ID!
  tweetId: ID!
  replyTweetId: ID!
  repliedBy: ID!
  createdAt: AWSDateTime!
}

union Notification @aws_iam @aws_cognito_user_pools =
    Retweeted
  | Liked
  | Mentioned
  | Replied

interface iNotification @aws_iam @aws_cognito_user_pools {
  id: ID!
  type: NotificationType!
  userId: ID!
  createdAt: AWSDateTime!
}

enum NotificationType {
  Retweeted
  Liked
  Mentioned
  Replied
}

```

```yml
# serverless.appsync-api.yml

mappingTemplates:
  ## SUBSCRIPTIONS
  # (73.3) add subscription to appsync.yml file
  - type: Subscription
    field: onNotified
    dataSource: none
```

Also add the vtl files `Subscription.onNotified.request.vtl` and
`Subscription.onNotified.response.vtl` to mappingTemplates folder.

## 74 Add subscription for retweets

Use a DDB stream to trigger a lambda function whenever a tweet is retweeted,
then send the notifyRetweeted mutation to AppSync API.

Like the usual:

- (74.0) Add the lambda function to serverless.yml, this one is similar to
  distributeTweets.
  - Additionally for this one reate a DynamoDB table to store notifications
- (74.1) Add the mapping template (GQL query) to `serverless.appsync.yml` and
  the dataSource
- (74.2) Add the JS for the lambda function.

```yaml
# serverless.yml

functions:
  notify:
    handler: functions/notify.handler
    environment:
      GRAPHQL_API_URL: !GetAtt AppsyncmasterclassGraphQlApi.GraphQLUrl
      TWEETS_TABLE: !Ref TweetsTable
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt TweetsTable.StreamArn
    iamRoleStatementsName: ${self:service}-${self:custom.stage}-notify
    iamRoleStatements:
      - Effect: Allow
        Action: appsync:GraphQL
        Resource: !Sub ${AppsyncmasterclassGraphQlApi.Arn}/*
      - Effect: Allow
        Action: dynamodb:GetItem
        Resource: !GetAtt TweetsTable.Arn

resources:
  NotificationsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      KeySchema:
        - AttributeName: id
          KeyType: HASH
        - AttributeName: userId
          KeyType: RANGE
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
      GlobalSecondaryIndexes:
        - IndexName: byUserId
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
            - AttributeName: id
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      Tags:
        - Key: Environment
          Value: ${self:custom.stage}
        - Key: Name
          Value: notifications-table
```

(74.1) Add the mapping template (GQL query) to `serverless.appsync.yml` and the
dataSource

```yaml
# serverless.appsync-api.yml

mappingTemplates:
  - type: Mutation
    field: notifyRetweeted
    dataSource: notificationsTable

dataSources:
  - type: AMAZON_DYNAMODB
    name: notificationsTable
    config:
      tableName: !Ref NotificationsTable
```

(74.2) Add the JS for the lambda function (similar to distribute-tweets)
`functions/notify.js`.

## 75 Add subscription for likes

Use a DDB stream to trigger a lambda function whenever a tweet is liked, then send the notifyLiked mutation to AppSync API.

Like the usual:

- (75.0) Add the lambda function to serverless.yml.
- (75.1) Add the mapping template (GQL query) to `serverless.appsync.yml`,  the dataSource `NotificationsTable` already exists from (74.1)
- (75.2) Add the JS for the lambda function.

```yaml
# serverless.yml

functions:
  notifyLiked:
    handler: functions/notify-liked.handler
    environment:
      GRAPHQL_API_URL: !GetAtt AppsyncmasterclassGraphQlApi.GraphQLUrl
      TWEETS_TABLE: !Ref TweetsTable
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt LikesTable.StreamArn
    iamRoleStatementsName: ${self:service}-${self:custom.stage}-notifyLiked
    iamRoleStatements:
      - Effect: Allow
        Action: appsync:GraphQL
        Resource: !Sub ${AppsyncmasterclassGraphQlApi.Arn}/*
      - Effect: Allow
        Action: dynamodb:GetItem
        Resource: !GetAtt TweetsTable.Arn
# serverless.appsync-api.yml

mappingTemplates:
  - type: Mutation
    field: notifyLiked
    dataSource: notificationsTable

# the dataSource already exists from (74.1)
```

Check out `functions/notify-liked.js`.

## 76-77 Add subscription for mentions & replies

```yaml
# serverless.appsync-api.yml

mappingTemplates:
  # (76.0) add a mapping template for the onNotified subscription
  - type: Subscription
    field: onNotified
    dataSource: none
  # (76.1) add a mapping template for the notifyMentioned mutation
  - type: Mutation
    field: notifyMentioned
    dataSource: notificationsTable
  # (77.0) add a mapping template for the notifyReplied mutation
  - type: Mutation
    field: notifyReplied
    dataSource: notificationsTable
```

We are reusing the notify lambda.
