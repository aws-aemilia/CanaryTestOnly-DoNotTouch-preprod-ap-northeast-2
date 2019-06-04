import * as React from 'react';
import {Button, Form} from "react-bootstrap";
import BootstrapTable from 'react-bootstrap-table-next';
import DateTimePicker from 'react-datetime-picker';
import AceEditor from 'react-ace';
import StageRegionSelector from '../../components/stageRegionSelector';
import Ajax from "../../ajax";

class Impact extends React.Component {
    constructor(props) {
        super(props);
        const now = new Date();
        this.state = {
            accounts: undefined,
            stage: '',
            region: '',
            group: undefined,
            groups: [],
            groupFilter: '',
            startTime: new Date(now.getTime() - (60 * 60 * 1000)),
            endTime: now,
            filterPattern: '"Receiving CreateAppRequest"',
            events: undefined
        };
    }
    resetGroup = () => this.setState({group: undefined});
    filterGroups = ({logGroupName}) => (this.state.group && logGroupName === this.state.group.logGroupName) ||
        (!this.state.group && logGroupName.toLowerCase().indexOf(this.state.groupFilter.toLowerCase()) >= 0);
    crawlEvents = async () => {
        this.setState({loading: true});
        const accounts = {};
        const timeDiff = 30 * 1000;
        const eventPromises = this.state.events.map(async (event) => {
            let requestId = undefined;
            let account = undefined;
            let start = undefined;
            let end = undefined;
            const reverseParams = {
                stage: this.state.stage,
                region: this.state.region,
                logGroupName: this.state.group.logGroupName,
                logStreamName: event.logStreamName,
                endTime: event.timestamp,
                nextToken: undefined,
                startFromHead: false,
                startTime: event.timestamp - timeDiff
            };
            const forwardParams = reverseParams;
            forwardParams.startTime = event.timestamp;
            forwardParams.endTime = event.timestamp + timeDiff;
            forwardParams.startFromHead = true;
            try {
                const revEvents = await this.loadEvents(reverseParams);
                const parsedEvents = [];
                console.log(event.message);
                revEvents.some(({message}) => {
                    console.log(message);
                    const result = this.extractInfo(message);
                    if (!account && result.account) {
                        account = result.account;
                    }
                    if (!start && result.startRequest) {
                        start = result.startRequest;
                    }
                    if (!end && result.endRequest) {
                        end = result.endRequest;
                    }
                    parsedEvents.push(message);
                    return (end || start);

                });
                requestId = start;
                if (!account) {
                    console.log('running reverse check');
                    const forEvents = await this.loadEvents(forwardParams);
                    const parsedEvents = [];
                    forEvents.some(({message}) => {
                        const result = this.extractInfo(message);
                        if (!account && result.account) {
                            account = result.account;
                        }
                        if (!start && result.startRequest) {
                            start = result.startRequest;
                        }
                        if (!end && result.endRequest) {
                            end = result.endRequest;
                        }
                        parsedEvents.push(message);
                        return (end || start);
                    });
                    if (!requestId && end) {
                        requestId = end;
                    }
                }
                if (!accounts[account]) {
                    accounts[account] = [];
                }
                if (accounts[account].indexOf(requestId) < 0) {
                    accounts[account].push(requestId);
                }
            } catch (e) {
                console.log(e);
            }
        });
        await Promise.all(eventPromises);
        this.setState({loading: false, accounts});
    };
    extractInfo = (logLine) => {
        const startRequest = 'START RequestId: ';
        const endRequest = 'END RequestId: ';
        const accountId = 'accountid';
        const result = {};
        if (logLine.indexOf(startRequest) >= 0) {
            console.log('found start');
            const subbed = logLine.replace(startRequest, '');
            result.startRequest = subbed.substr(0, subbed.indexOf(' '));
        }
        if (logLine.indexOf(endRequest) >= 0) {
            console.log('found end');
            const subbed = logLine.replace(endRequest, '');
            result.endRequest = subbed.substr(0, subbed.indexOf(' '));
        }
        if (logLine.toLowerCase().indexOf(accountId) >= 0) {
            console.log('found account');
            result.account = logLine.substr(logLine.toLowerCase().indexOf(accountId), logLine.length).replace(/([A-z]|\s|:|=)/g, '');
        }
        return result;
    };
    loadGroups = async () => {
        try {
            this.setState({loading: true});
            const {data: groups} = await Ajax().fetch('/cwlogs/groups?stage=' + this.state.stage + '&region=' + this.state.region);
            this.setState({loading: false, groups})
        } catch (error) {
            this.setState({error});
        }
    };
    getEvents = async () => {
        try {
            this.setState({loading: true});
            // let nextToken = undefined;
            const params = {
                stage: this.state.stage,
                region: this.state.region,
                logGroupName: this.state.group.logGroupName,
                endTime: this.state.endTime.getTime(),
                filterPattern: this.state.filterPattern,
                // limit: 'NUMBER_VALUE',
                nextToken: undefined,
                startTime: this.state.startTime.getTime()
            };
            const events = await this.loadEvents(params);
            this.setState({events});
            this.crawlEvents();
        } catch (error) {
            this.setState({error});
        }
    };
    loadEvents = async (params) => {
        let events = [];
        do {
            const {data} = await Ajax().post('/cwlogs/events/filter', params);
            params.nextToken = data.nextToken;
            events = [
                ...events,
                ...data.events
            ];
        } while (params.nextToken);
        return events;
    };
    render() {
        const columns = [
            {
                dataField: 'logGroupName',
                text: 'Name',
                headerFormatter: () => this.state.group ? <span style={{lineHeight: '38px'}}>Log group</span> : (
                    <Form.Control
                        type="text"
                        placeholder="Log groups - type here to filter"
                        onChange={(event) => this.setState({groupFilter: event.target.value})}
                        value={this.state.groupFilter}
                    />
                )
            }
        ];
        const selectRow = {
            mode: 'radio',
            clickToSelect: true,
            selected: this.state.group ? [this.state.group.logGroupName] : [],
            selectionHeaderRenderer: () => <Button onClick={this.resetGroup} disabled={!this.state.group || this.state.loading}>Clear</Button>,
            onSelect: (group) => this.setState({group}),
        };
        let impactedRequests = 0;
        if (this.state.accounts) {
            Object.keys(this.state.accounts).forEach((key) => impactedRequests += this.state.accounts[key].length);
        }
        return (
            <div>
                <StageRegionSelector
                    regions={this.props.regions}
                    stage={this.state.stage}
                    region={this.state.region}
                    loading={this.state.loading}
                    onStageChange={(stage) => this.setState({stage, region: ''})}
                    onRegionChange={(region) => this.setState({region})}
                >
                    <Button
                        variant="primary"
                        disabled={!this.state.stage || !this.state.region || this.state.loading}
                        onClick={this.loadGroups}
                    >
                        Get groups
                    </Button>
                </StageRegionSelector>
                <BootstrapTable
                    bootstrap4
                    striped
                    keyField='logGroupName'
                    condensed={true}
                    data={this.state.groups.filter(this.filterGroups)}
                    columns={columns}
                    selectRow={selectRow}
                />
                {this.state.group && <div>
                    <div>
                        Event start time:
                        <DateTimePicker
                            onChange={(startTime) => this.setState({startTime})}
                            value={this.state.startTime}
                        />
                    </div>
                    <div>
                        Event end time:
                        <DateTimePicker
                            onChange={(endTime) => this.setState({endTime})}
                            value={this.state.endTime}
                        />
                    </div>
                    <Form.Control
                        type="text"
                        placeholder="Filter pattern"
                        onChange={(event) => this.setState({filterPattern: event.target.value})}
                        value={this.state.filterPattern}
                    />
                    <Button
                        variant="primary"
                        disabled={!this.state.stage || !this.state.region || this.state.loading}
                        onClick={this.getEvents}
                    >
                        Get Events
                    </Button>
                </div>}
                {this.state.accounts && <div>
                    <div><b>{Object.keys(this.state.accounts).length}</b> impacted accounts</div>
                    <div><b>{impactedRequests}</b> impacted requests</div>
                    <AceEditor
                        theme="dracula"
                        name="ace_logs"
                        value={Object.keys(this.state.accounts).map((key) => `${key} (${this.state.accounts[key].length})`).join('\n')}
                        width={'100%'}
                        maxLines={Object.keys(this.state.accounts).length + 1}
                        minLines={Object.keys(this.state.accounts).length + 1}
                        showPrintMargin={false}
                        editorProps={{
                            $blockScrolling: Infinity
                        }}
                    />
                    <AceEditor
                        theme="dracula"
                        name="ace_logs"
                        value={Object.keys(this.state.accounts).map((key) => this.state.accounts[key].join('\n')).join('\n')}
                        width={'100%'}
                        maxLines={impactedRequests + 1}
                        minLines={impactedRequests + 1}
                        showPrintMargin={false}
                        editorProps={{
                            $blockScrolling: Infinity
                        }}
                    />
                </div>}
            </div>
        );
    }
}

export default Impact;
