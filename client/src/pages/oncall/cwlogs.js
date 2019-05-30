import * as React from 'react';
import {Button, Form} from "react-bootstrap";
import BootstrapTable from 'react-bootstrap-table-next';
import DateTimePicker from 'react-datetime-picker';
import StageRegionSelector from '../../components/stageRegionSelector';
import Ajax from "../../ajax";

class CWLogs extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            stage: '',
            region: '',
            group: undefined,
            groups: [],
            groupFilter: '',
            startTime: new Date(),
            endTime: new Date(),
            filterPattern: '',
            events: undefined,
            duration: 30
        };
    }
    resetGroup() {
        this.setState({
            group: undefined
        });
    }
    filterGroups = ({logGroupName}) => (this.state.group && logGroupName === this.state.group.logGroupName) ||
        (!this.state.group && logGroupName.toLowerCase().indexOf(this.state.groupFilter.toLowerCase()) >= 0);
    checkEvents = async () => {
        const timeDiff = this.state.duration * 1000;
        const eventPromises = this.state.events.map(async (event) => {
            // eventId: "34756578402400375435394480656718402594410044237201670161"
            // ingestionTime: 1558538889752
            // logStreamName: "2019/05/22/[$LATEST]7583b751a1b44440b36aab80f4b8fdd9"
            // message: "com.amazonaws.services.dynamodbv2.model.ConditionalCheckFailedException: The conditional request failed (Service: AmazonDynamoDBv2; Status Code: 400; Error Code: ConditionalCheckFailedException; Request ID: EJ1QBOVNR4D70D6P01ALSJSG2NVV4KQNSO5AEMVJF66Q9ASUAAJG)↵"
            // timestamp: 1558538878095

            const params = {
                stage: this.state.stage,
                region: this.state.region,
                logGroupName: this.state.group.logGroupName,
                logStreamName: event.logStreamName,
                endTime: event.timestamp,
                nextToken: undefined,
                startFromHead: false,
                startTime: event.timestamp - timeDiff
            };
        })
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
            selectionHeaderRenderer: () => <Button onClick={this.resetGroup} disabled={!this.state.group}>Clear</Button>,
            onSelect: (group) => this.setState({group}),
        };

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
                        onClick={async () => {
                            try {
                                this.setState({loading: true});
                                const {data: groups} = await Ajax().fetch('/cwlogs/groups?stage=' + this.state.stage + '&region=' + this.state.region);
                                this.setState({loading: false, groups})
                            } catch (error) {
                                this.setState({error});
                            }
                        }}
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
                    onClick={async () => {
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
                            let events = [];
                            do {
                                const {data} = await Ajax().post('/cwlogs/events/filter', params);
                                params.nextToken = data.nextToken;
                                events = [
                                    ...events,
                                    ...data.events
                                ]
                            } while (params.nextToken);
                            this.setState({loading: false, events})
                        } catch (error) {
                            this.setState({error});
                        }
                    }}
                >
                    Get Events
                </Button>
                <div>
                    Max operation duration (in seconds)
                    <Form.Control
                        type="number"
                        onChange={(event) => this.setState({duration: event.target.value})}
                        value={this.state.duration}
                    />
                </div>
                {this.state.events && <div>{this.state.events.length} Events found</div>}
            </div>
        );
    }
}

export default CWLogs;
