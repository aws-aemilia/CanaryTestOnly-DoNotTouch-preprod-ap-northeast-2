import React, {Component} from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';
import NavBar from '../components/navbar';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCrosshairs} from '@fortawesome/free-solid-svg-icons'
import {faUser} from '@fortawesome/free-solid-svg-icons'
import Ajax from '../ajax';

class Failures extends Component {
    // Initialize the state
    constructor(props) {
        super(props);
        this.state = {
            failures: null,
            combinedLogs: null,
            processingAppsTotal: null,
            processingAppsCurrent: null,
            loading: true,
            days: null,
            error: false,
            daysTo: null,
            daysFrom: null
        };
    }

    componentDidMount() {
        this.getList();
    }

    getList = () => {
        const isMetrics = true;
        const {match: {params}} = this.props;
        let url = null;

        const days = params['days'] ? params['days'] : 5;
        this.setState({'days': days});

        if (params['accountId']) {
            url = `/api/metrics/builds/failed?accountId=${params['accountId']}`;
        } else if (params['appId']) {
            url = `/api/metrics/builds/failed?appId=${params['appId']}`;
        } else if (params['daysFrom'] && params['daysTo']) {
            url = `/api/metrics/builds/failed?daysFrom=${params['daysFrom']}&daysTo=${params['daysTo']}`;
        } else {
            url = '/api/metrics/builds/failed?days=' + days;
        }

        Ajax(isMetrics).fetch(url)
            .then(async ({data: json}) => {
                if (json.rows.length <= 0) {
                    this.setState({'error': true, 'loading': false});
                    return;
                }
                return Object.entries(_.groupBy(json.rows, 'appid')).map(item => {
                    return {
                        count: _.uniqBy(item[1], 'jobid').length,
                        appid: item[0],
                        timestamp: item[1][0].timestamp,
                        accountid: item[1][0].accountid,
                        jobid: item[1][0].jobid,
                        region: item[1][0].region,
                        jobs: _.uniqBy(item[1], 'jobid').sort((a, b) => a.jobid - b.jobid)
                    }
                });
            })
            .then(async list => {
                this.setState({failures: list});
                let appBuilds = [];
                let combinedLogs = [];

                this.setState({processingAppsTotal: list.length});
                // Iterate over apps
                for (let app of list) {
                    this.setState({processingAppsCurrent: list.indexOf(app)});
                    let result = await Ajax(isMetrics).fetch(`/api/logsbyprefix?region=${app.region}&logGroupName=${'AWSCodeBuild'}&logStreamNamePrefix=${app.appid}`);
                    let streams = result.data;

                    streams.sort(function(a, b){return b.creationTime - a.creationTime});
                    streams = streams.slice(0,2);

                    let logs = [];
                    for (let stream of streams) {
                        let logResult = await Ajax().fetch(`/api/logs?region=${app.region}&logGroupName=${'AWSCodeBuild'}&logStreamName=${stream.logStreamName.replace('|', '/')}`);

                        let errors = logResult.data.events.filter(logEntry => logEntry.message.indexOf(' Error') > 0 || logEntry.message.indexOf(' error') > 0);

                        if (errors.length > 0) {
                            logs = logs.concat(errors.map(value => value.message.substr(value.message.toLowerCase().indexOf('error'))));
                        }
                    }

                    combinedLogs = combinedLogs.concat(logs);
                    appBuilds.push({[app.appid]: logs});
                }

                this.setState({combinedLogs, loading: false});
            });
    };

    onTargetClick(row) {
        window.location.href = `/builds/${row.region}/${row.appid}`;
    }

    onUserClick(row) {
        window.location.href = `https://aws-tools.amazon.com/servicetools/search.aws?searchType=ACCOUNT&query=${row.accountid}`;
    }

    actionFormatter = (cell, row) => {
        return (
            <div>
                <div style={{display: 'inline-block', cursor: 'pointer'}} onClick={() => this.onTargetClick(row)}>
                    <FontAwesomeIcon icon={faCrosshairs}/></div>
                &nbsp;
                <div style={{display: 'inline-block', cursor: 'pointer'}} onClick={() => this.onUserClick(row)}>
                    <FontAwesomeIcon icon={faUser}/></div>
            </div>
        );
    };

    render() {
        const {combinedLogs, loading, error} = this.state;

        let list = [];
        if (combinedLogs) {
            let hash = Object.create(null);
            combinedLogs.forEach(value => {
                if (!hash[value]) {
                    hash[value] = 1;
                } else {
                    hash[value]++;
                }
            });

            Object.keys(hash).forEach(value => {
                list.push({'key': value.substr(0,100), error: value, 'count': hash[value]});
            });
        }

        const columns = [
            {dataField: 'key', text: 'Error', sort: false},
            {dataField: 'count', text: 'Count', sort: true}
        ];
        const defaultSorted = [{
            dataField: 'count',
            order: 'desc'
        }];

        return (
            <div className="App">
                <NavBar/>
                {list && list.length ? (
                    <div>
                        <BootstrapTable bootstrap4 striped keyField='key' condensed={true} data={list}
                                        columns={columns} defaultSorted={defaultSorted} rowStyle={ { 'word-wrap': 'break-word'} }/>
                    </div>
                ) : (
                    loading ? (

                        <div>
                            <div className="spinner-grow text-primary" role="status">
                                <span className="sr-only">Loading...</span>

                            </div>
                            <div>
                                <div><h3>Analyzing Logs from {this.state.processingAppsTotal} AC apps...</h3></div>
                                <div className="progress" style={{width: '30%', 'margin': '0 auto' }}>
                                    <div className="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style={{width: ((this.state.processingAppsCurrent * 100) / this.state.processingAppsTotal) + '%'}}
                                         aria-valuenow={this.state.processingAppsCurrent} aria-valuemin="0" aria-valuemax={this.state.processingAppsTotal}>
                                    </div>
                                </div>
                                <div>Processing {this.state.processingAppsCurrent} of {this.state.processingAppsTotal}</div>
                            </div>
                        </div>
                    ) : (
                        <div>
                        </div>
                    )
                )
                }
                {error ? (
                    <div className="alert alert-danger" role="alert">
                        No Builds Found
                    </div>
                ) : (<div/>)
                }
            </div>
        );
    }
}

export default Failures;
