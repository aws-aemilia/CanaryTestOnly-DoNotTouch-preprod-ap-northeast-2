This package is deployed to 718161700038 using claudia

Production stack is updated automatically when a change is pushed.

## To stand up local stack ##

1. Get the creds using Isengard
    1. To do so, open Isengard
    1. Search the above accountId 
    1. Click the icon next to the "Admin" link
    1. Copy and paste the section "AWS CLI on Linux or macOS" into terminal
1. To install claudia:
```
npm install claudia -g
```
3. Run the create command. **Update the name to have your username**
```
claudia create --name amplifytools-USERNAME --config claudia.alpha.json --region us-west-2 --handler lambda.handler --deploy-proxy-api
```
4. Enable IAM auth on your API
    1. Open the API Gateway console (using Isengard)
    1. Open your API (has the name you specified above)
    1. Under resources, update both "Any"s to use IAM auth
        1. Click on the "Any"
        1. Click "Method Request"
        1. Change "Authorization" to "AWS_IAM"
        1. Repeat for the other "Any" on the main page
1. Deploy the API
1. Add permissions to executor role
    1. Open IAM console
    1. Go to roles and select your role
    1. Add "AmplifyBusinessMetricsGetCredentials" policy
    1. Add "AmazonAPIGatewayInvokeFullAccess" policy
1. Update your lambda
    1. Open lambda console and open your lambda
    1. Change timeout to 30 seconds
    1. Change memory to 256mb
    1. Cange VPC to "Celsus-Internal"
    1. Add "LambdaSubnet1" and "LambdaSubnet2"
    1. Add "awsamplify-tools" security groups
1. Finally add the endpoint to /client/.env
```
REACT_APP_API_ENDPOINT=https://STACKID.execute-api.us-west-2.amazonaws.com/latest
```

## Update local stack ##
```
claudia update --config claudia.alpha.json
```
    

