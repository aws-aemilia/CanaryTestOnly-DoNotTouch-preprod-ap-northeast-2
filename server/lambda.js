'use strict'
const awsServerlessExpress = require('aws-serverless-express')
const app = require('./main')
const {setEvent} = require('./event')
const binaryMimeTypes = [
	'application/octet-stream',
	'font/eot',
	'font/opentype',
	'font/otf',
	'image/jpeg',
	'image/png',
	'image/svg+xml'
]
const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);
exports.handler = (event, context) => setEvent(event) & awsServerlessExpress.proxy(server, event, context)
