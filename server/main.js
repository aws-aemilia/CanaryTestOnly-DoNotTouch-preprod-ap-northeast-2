const express = require('express');
const path = require('path');
const config = require('./config');
const redShiftClient = config.db.get();
const { execSync } = require('child_process');

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

app.get('/api/metrics/builds/failed', (req, res) => {
    redShiftClient.query('select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\'', {}, function(err, data){
        if(err) throw err;
        else{
            res.end(JSON.stringify(data));
        }
    });
});

app.get('/api/logs', (req, res) => {
    const stdout = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.395333095307.user/ReadOnlyLogs');
    res.end(stdout);
});

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.sendFile(path.join(__dirname+'/../client/build/index.html'));
});

app.listen(config.port);

console.log('App is listening on port ' + config.port);
