# appsyncmasterclass-backend

## 4.1 Setup backend project

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

## 4.2 Design the GraphQL schema

[4.2] Create the file [schema.api.gaphql](./schema.api.graphql). (Take a look at
the notes there).

It is very much like a TS file with types.

Identify and implement the schema; Queries, Mutations, types and interfaces that
will be used in the system.

Use interface to solidify the common properties between types (MyProfile vs
OtherProfile).

## 4.3 Configure Cognito User Pool

_(4.3.0)_ Before the GraphQL schema can be deployed, we need to create a AWS
Cognito User Pool and associate it with our AppSync API configuration. This is
done under `resources` section of [serverless.yml](./serverless.yml):

```yml
resources:
  Resources:
    CognitoUserPool:
```

(_4.3.1_) We need the CognitoUserPoolId of the CognitoUserPool as a cloud
formation output.

```yml
Outputs:
  CognitoUserPoolId:
    Value: !Ref CognitoUserPool
```

_(4.3.2)_ After configuring the Cognito User Pool, we need to configure the
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

_(4.3.4)_ Now it is time to deploy. You need to have a AWSAccessKeyId and
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

Then deploy with `npm run deploy`. In _AWS console / Cognito_ we find
`appsyncmasterclass` as defined in
[serverless.appsync-api.yml](./serverless.appsync-api.yml)

_(4.3.5)_ We need to be logged in with Cognito to test AppSync queries. Create a
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

_(4.3.6)_ At AWS AppSync, _Login via Cognito User Pools_ and test out some
queries.

## 4.4 Save user profile on PostConfirmation

- Capture the new user that gets created in Cognito.

- Save the user in a DynamoDB table:
  - (use a lambda trigger at _CognitoUserPool / Triggers_). After a user is
    confirmed, send a message to a lambda function, and that function can save
    the user in the DynamoDB table.
- That will allow us to use AppSync query and mutations

_(4.4.0)_ Create a DynamoDB table to store user profiles

```yml
resources:
  Resources:
    UsersTable:
    CognitoUserPool: ##
    WebUserPoolClient: ##
```

> Convention: _(4.4.0.1)_ Environment is dev, unless we pass in a stage override
> with `npm run sls -- -s prod`
>
> ```yml
> custom:
>   # Environment is dev, unless we pass in a stage override
>   stage: ${opt:stage, self:provider.stage}
>   appSync:
>     - ${file(serverless.appsync-api.yml)}
> ```

_(4.4.1)_ Add a functions block for the lambda trigger function

The function needs to know the name of the UsersTable, which is generated by
CloudFormation.

_(4.4.2)_ Install `npm i -D serverless-iam-roles-per-function` , which allows
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

_(4.4.3)_ Configure Cognito to call the above lambda trigger function when a new
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

_(4.4.4)_ We also need to give Cognito additional permissions to call the lambda
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

_(4.4.5)_ Now we add the lambda function
[./functions/confirm-user-signup.js](./functions/confirm-user-signup.js)

## 4.5 Testing overview

With serverless apps, unit tests do not give enough confidence for the cost. Same cost & little value vs integration tests. Apply the test honeycomb, prefer integration tests over unit tests, and some e2e. All because many things can go wrong, none of which are related to our lambda code.

Unit test covers the business logic.![unit-test](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ckgcm75wpg1ezpk5cqpr.png)

Integration is the same cost, and more value than unit. Covers the business logic + DynamoDB interaction.![integration-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/irn19obybd4dfs9bni74.png)There are things integration tests cannot cover, but they are a good bang for the buck.![integration](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/gtkxvl1yh7fqwahptxfa.png)

E2e can cover everything, highest confidence but also costly. We need some.![e2e-described](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1vtufpqa62fdgprlqt6c.png)

![e2e](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qjra5fzp7yr31r06dfzd.png)

Prop-tips from Yan:

* Avoid local simulation (e.g. LocalStack), they’re more work than is worth it, and hides common failure modes such as misconfigured permissions and resource policies.
* In integration tests, only use mocks for AWS services to simulate hard-to-reproduce **failure cases**. If it's happy path, do not mock AWS. You can mock your internal services/APIs.
* Use temporary stacks for feature branches to avoid destabilizing shared environments, and during CI/CD pipeline to run end-to-end tests to remove the overhead of cleaning up test data. https://theburningmonk.com/2019/09/why-you-should-use-temporary-stacks-when-you-do-serverless/

## 4.6 Integration testing

Use the `serverless-export-env` plugin to create a `.env` file with our env vars. It picks up a few values from `serverless.yml`.

```bash
npm i -D jest @types/jest dotenv

# add it as a plugin to serverless.yml
# later version does not download COGNITO_USER_POOL_ID USERS_TABLE 
npm i -D serverless-export-env@v1.4.0 
npm run sls -- export-env
```

Add AWS_REGION and USER_POOL_ID to Outputs, so that they can also be acquired via the plugin. Use the `${self:custom.*}` trick for AWS_REGION, because we cannot use it as lambda function level since that is specific to sls. 

```yml
# serverless.yml
provider:
  environment:
    STAGE: # picks up
    AWS_NODEJS_CONNECTION_REUSE_ENABLED: # picks up
    
custom:
  # (4.6) add AWS_REGION as an env var (use region from CLI command override, otherwise provider:region:)
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

After the `serversless.yml` change, we have to deploy and run `npm run sls -- export-env` again. Finally, we have an `.env` file with 5 values:

```dotenv
# .env
STAGE=dev
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
COGNITO_USER_POOL_ID=eu-west-1_***
AWS_REGION=eu-west-1
USERS_TABLE=appsyncmasterclass-backend-dev-UsersTable-***
```

 In the test there are 3 main things we do:

* Create an event: an object which includes user info.
* Feed the event to the handler
* As a result we should see a DynamoDB table entry, confirm it.

Take a look at [./__tests__/confirm-user-signup-integration.test.js](./__tests__/confirm-user-signup-integration.test.js).

## 4.7 E2e test 

In order to work with cognito and simulate a user signup, we need `WebUserPoolClient` id. We capture that as an output in the `serverless.yml ` `Outputs` section, similar to what we did to acquire *COGNITO_USER_POOL_ID (4.3.1)*.

```yml
Outputs:
	# lets us use process.env.COGNITO_USER_POOL_ID 
  CognitoUserPoolId:
    Value: !Ref CognitoUserPool
  # lets us use process.env.WEB_COGNITO_USER_POOL_CLIENT_ID
  WebUserPoolClientId:
    Value: !Ref WebUserPoolClient
```

After the `serversless.yml` change, we have to deploy `npm run deploy` and export environment `npm run export:env`. Finally, we have an `.env` file with 6 values:

```dotenv
# .env
STAGE=dev
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
COGNITO_USER_POOL_ID=eu-west-1_***
WEB_COGNITO_USER_POOL_CLIENT_ID=******
AWS_REGION=eu-west-1
USERS_TABLE=appsyncmasterclass-backend-dev-UsersTable-***
```

 In the test there are 3 main things we do:

* We create a user from scratch using `AWS.CognitoIdentityServiceProvider`  (cognito).
* We are not using a real email, so we use `cognito.adminConfirmSignup` to simulate the user sign up verification.
* As a result we should see a DynamoDB table entry, confirm it.

Take a look at [./__tests__/confirm-user-signup-e2e.test.js](./__tests__/confirm-user-signup-e2e.test.js).

## 4.8 Implement `getMyProfile` query (setup an AppSync resolver and have it get an item from DDB)

After the user is signed up and confirmed, we can get the data from DynamoDB, similar to what we did in the integration and e2e tests.

We need to setup an AppSync resolver and have it get an item from DDB.

*(4.8.1)* Tell the serverless AppSync plugin where the Appsync templates are going to be, and how to map them to the graphQL query.

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

*(4.8.2)* Per convention, add two files at the folder `./mapping-templates`, `Query.getMyProfile.request.vtl`, `Query.getMyProfile.response.vtl` . Realize how it matches `mappingTemplates:type&field`. Use the info in these two AWS docs to configure the `vtl` files [1](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html), [2](https://docs.aws.amazon.com/appsync/latest/devguide/dynamodb-helpers-in-util-dynamodb.html):

* Take the identity of the user (available in `$context.identity`), take the username and turn it into a DDB structure.

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

* For the response, turn it into json. The response is captured by AppSync into `$context.result`

```vtl
// mapping-templates/Query.getMyProfile.response.vtl
$util.toJson($context.result)
```

Deploy with `npm run deploy`. Verify that changes worked by looking for the string `GraphQlResolverQuerygetMyProfile` under the templates in `.serverless` folder

*(4.8.3)* To test at the AWS console, we need a new Cognito user similar to the ones created in the integration and e2e tests before. We do not have access to those, so we use AWS CLI to create a cognito user.

`aws cognito-idp --region eu-west-1 sign-up --client-id <yourEnvVarForWebCognitoUserPoolClientId> --username <yourEmail> --password <yourPw> --user-attributes Name=name,Value=<yourName>`

Once the command goes through, we should have an unconfirmed user in the Cognito console. Confirm the user here. Go to AppSync and sign in with the user. Create a query for `getMyProfile` and we should see results.

![AppSyncQuery](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7qxfzx1880j0670i33j5.png)

Try asking for the tweets field. There is no resolver associated with it, so AppSync will return a null. 

## 4.8 Unit test `getMyProfile` query
