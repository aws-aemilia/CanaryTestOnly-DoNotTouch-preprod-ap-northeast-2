import React, {Component} from 'react';
import AceEditor from 'react-ace';
import BootstrapTable from 'react-bootstrap-table-next';
import Ajax from '../../ajax';
import {DropdownButton, Dropdown, Button} from "react-bootstrap";
import StageRegionSelector from '../../components/stageRegionSelector';

export default class extends Component {
    constructor(props) {
        super(props);
        this.state = {
            stage: '',
            region: '',
            foundMessages: [],
            notFoundMessages: [],
            messages: [],
            loading: false,
            message: '',
            type: '',
            getError: undefined,
            deleteError: undefined,
            showAccounts: false,
            lastResultLength: undefined
        };
    }

    expandRowRender = (row) => {
        const message = {...row.message, Body: JSON.parse(row.message.Body)};
        const cleanedMessage = {};
        Object.keys(message).filter((key) => key !== 'ReceiptHandle').forEach((key) => cleanedMessage[key] = message[key]);
        const messageText = JSON.stringify(cleanedMessage, null, 4);
        return (
            <div>
                <AceEditor
                    theme="dracula"
                    name="ace_logs"
                    value={messageText}
                    minLines={messageText.split('\n').length + 2}
                    maxLines={messageText.split('\n').length + 2}
                    width={'100%'}
                    showPrintMargin={false}
                    editorProps={{
                        $blockScrolling: Infinity
                    }}
                />
                <Button
                    style={{margin: '1rem 0'}}
                    variant="primary"
                    disabled={this.state.loading}
                    onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this record')) {
                            this.setState({loading: true, deleteError: undefined});
                            const ReceiptHandle = message.ReceiptHandle;
                            try {
                                await Ajax().post('/metering/delete?stage=' + this.state.stage + '&region=' + this.state.region + '&type=' + this.state.type, {ReceiptHandle});
                                const filterHandle = (item) => item.ReceiptHandle !== ReceiptHandle;
                                this.setState({
                                    notFoundMessages: this.state.notFoundMessages.filter(filterHandle),
                                    foundMessages: this.state.foundMessages.filter(filterHandle),
                                    messages: this.state.messages.filter(filterHandle),
                                    loading: false
                                });
                            } catch (e) {
                                this.setState({deleteError: e, loading: false});
                            }
                        }
                    }}
                >
                    Delete
                </Button>
            </div>
        )
    };
    expandRow = {
        renderer: this.expandRowRender,
    };

    render() {
        const messagesAvailable = this.state.messages.length > 0;
        const getKeys = () => {
            if (!messagesAvailable) {
                return [];
            }
            const body = JSON.parse(this.state.messages[0].Body);
            return Object.keys(body).filter((key) => body[key] !== null && key !== 'messageVersion').map((key) => ({
                dataField: key,
                text: key
            }));
        };
        const columns = messagesAvailable ? [
            ...(getKeys()),
            {dataField: 'MD5OfBody', text: 'MD5OfBody', hidden: true}
        ] : [];
        const notFoundList = this.state.notFoundMessages.map((message) => ({
            ...JSON.parse(message.Body),
            message,
            MD5OfBody: message.MD5OfBody
        }));
        const foundList = this.state.foundMessages.map((message) => ({
            ...JSON.parse(message.Body),
            message,
            MD5OfBody: message.MD5OfBody
        }));
        const messages = this.state.messages.map((message) => ({
            ...JSON.parse(message.Body),
            message,
            MD5OfBody: message.MD5OfBody
        }));
        const accounts = [];
        messages.forEach((message) => {
            if (accounts.indexOf(message.accountId) < 0) {
                accounts.push(message.accountId);
            }
        });
        return (
            <div>
                <div>
                    <StageRegionSelector
                        regions={this.props.regions}
                        stage={this.state.stage}
                        region={this.state.region}
                        loading={this.state.loading}
                        onStageChange={(stage) => this.setState({stage, region: '', messages: [], notFoundMessages: [], foundMessages: []})}
                        onRegionChange={(region) => this.setState({region, messages: [], notFoundMessages: [], foundMessages: []})}
                    >
                        <DropdownButton
                            title={'Type' + (this.state.type ? ' - ' + this.state.type : '')}
                            variant={'secondary'}
                            disabled={!this.state.stage || !this.state.region || this.state.loading}
                            id={'dropdown-variants-primary'}
                            key={'type'}
                        >
                            {['Deriver', 'REMO', 'Standard'].map((type, index) => (
                                <Dropdown.Item
                                    key={type}
                                    eventKey={index}
                                    onSelect={() => this.setState({type, messages: [], notFoundMessages: [], foundMessages: []})}
                                >
                                    {type}
                                </Dropdown.Item>
                            ))}
                        </DropdownButton>
                        <Button
                            variant="primary"
                            disabled={!this.state.stage || !this.state.region || !this.state.type || this.state.loading}
                            onClick={async () => {
                                this.setState({loading: true});
                                const {data} = await Ajax().fetch('/metering/get?stage=' + this.state.stage + '&region=' + this.state.region + '&type=' + this.state.type);
                                this.setState({
                                    notFoundMessages: this.mergeMessages(data.notFoundMessages ? data.notFoundMessages : [], this.state.notFoundMessages),
                                    foundMessages: this.mergeMessages(data.foundMessages ? data.foundMessages : [], this.state.foundMessages),
                                    messages: this.mergeMessages(data.messages ? data.messages : [], this.state.messages),
                                    loading: false,
                                    lastResultLength: data.messages ? data.messages.length : 0
                                });
                            }}
                        >
                            Get records
                        </Button>
                        {messages.length > 0 && <div><b>Changing the stage/region/queue will clear the tables</b></div>}
                    </StageRegionSelector>
                    {this.state.lastResultLength >= 10 && <div style={{margin: '1rem 0'}}>10 messages were found in the queue, there could be more.</div>}
                    {this.state.lastResultLength === 0 && <div style={{margin: '1rem 0'}}>No messages found in queue. There could be messages in flight, please wait a few then try again</div>}
                    {accounts.length > 0 && <div>
                        <div>There are <b>{accounts.length}</b> unique accounts</div>
                        <div>There are <b>{messages.length}</b> total messages</div>
                        <Button
                            variant="primary"
                            onClick={() => this.setState({showAccounts: !this.state.showAccounts})}>
                            Show accounts
                        </Button>
                    </div>}
                    {this.state.showAccounts && <div>
                        <AceEditor
                            theme="dracula"
                            name="ace_logs"
                            value={accounts.join('\n')}
                            minLines={accounts.length + 1}
                            maxLines={accounts.length + 1}
                            width={'100%'}
                            showPrintMargin={false}
                            editorProps={{
                                $blockScrolling: Infinity
                            }}
                        />
                    </div>}
                    {this.state.type === 'REMO' && messagesAvailable && <div>
                        <div className="metering-table">
                            <h3>Messages from REMO event</h3>
                            <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={foundList}
                                            columns={columns} expandRow={this.expandRow}/>
                        </div>
                        <div className="metering-table">
                            <h3>Messages not from REMO event - bad</h3>
                            <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={notFoundList}
                                            columns={columns} expandRow={this.expandRow}/>
                        </div>
                    </div>}
                    {messagesAvailable && <div className="metering-table">
                        <h3>All messages</h3>
                        <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={messages}
                                        columns={columns} expandRow={this.expandRow}/>
                    </div>}
                    {this.state.deleteError && <div>
                        Error during delete
                        <AceEditor
                            theme="dracula"
                            name="ace_logs"
                            value={JSON.stringify(this.state.deleteError, null, 4)}
                            width={'100%'}
                            showPrintMargin={false}
                            editorProps={{
                                $blockScrolling: Infinity
                            }}
                        />
                    </div>}
                </div>
            </div>
        )
    }
    mergeMessages = (existingMessages, newMessages) => {
        const md5s = [];
        return [
            ...existingMessages,
            ...newMessages
        ].filter(({MD5OfBody}) => {
            if (md5s.indexOf(MD5OfBody) < 0) {
                md5s.push(MD5OfBody);
                return true;
            }
            return false;
        })
    }
}
