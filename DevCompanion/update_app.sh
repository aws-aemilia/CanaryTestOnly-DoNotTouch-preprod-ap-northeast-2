#!/bin/bash
source .env
aws amplify update-app --app-id d2j7hbtx0uqow0 --platform WEB_DYNAMIC --region us-west-2 --endpoint-url $ENDPOINT_ME