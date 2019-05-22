import React, { Component } from 'react';
import AceEditor from 'react-ace';
import BootstrapTable from 'react-bootstrap-table-next';
import Ajax from '../ajax';
import NavBar from '../components/navbar';
import {ButtonToolbar, DropdownButton, Dropdown, Button} from "react-bootstrap";

export default class extends Component {
  constructor(props) {
    super(props);
    this.state = {
      regions: {},
      stage: '',
      region: '',
      foundMessages: [],
      notFoundMessages: [],
      messages: [],
      loading: false,
      message: '',
      type: '',
      empty: false,
      getError: undefined,
      deleteError: undefined,
      showAccounts: false
    };
    this.getRegions();
  }
  async getRegions() {
    const {data: regions} = await Ajax().fetch('/regions');
    this.setState({regions});
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
    const regions = this.state.regions;
    const messagesAvailable = this.state.messages.length > 0;
    const getKeys = () => {
      if (!messagesAvailable) {
        return [];
      }
      const body = JSON.parse(this.state.messages[0].Body);
      return Object.keys(body).filter((key) => body[key] !== null && key !== 'messageVersion').map((key) => ({dataField: key, text: key}));
    };
    const columns = messagesAvailable ? [
      ...(getKeys()),
      {dataField: 'MD5OfBody', text: 'MD5OfBody', hidden: true}
    ] : [];
    const notFoundList = this.state.notFoundMessages.map((message) => ({...JSON.parse(message.Body), message, MD5OfBody: message.MD5OfBody}));
    const foundList = this.state.foundMessages.map((message) => ({...JSON.parse(message.Body), message, MD5OfBody: message.MD5OfBody}));
    const messages = this.state.messages.map((message) => ({...JSON.parse(message.Body), message, MD5OfBody: message.MD5OfBody}));
    const accounts = [];
    messages.forEach((message) => {
      if (accounts.indexOf(messages.accountId) < 0) {
        accounts.push(message.accountId);
      }
    });
    return (
      <div>
        <NavBar/>
        <div>
          <ButtonToolbar style={{margin: '1rem'}} className="metering-button-toolbar">
            <DropdownButton
              title={'Stage' + (this.state.stage ? ' - ' + this.state.stage : '')}
              disabled={this.state.loading}
              variant={'primary'}
              id={'dropdown-variants-primary'}
              key={'stage'}
            >
              {Object.keys(regions).map((stage, index) => (
                <Dropdown.Item
                  key={stage}
                  eventKey={index}
                  onSelect={() => this.setState({stage, region: ''})}
                >
                  {stage}
                </Dropdown.Item>
              ))}
            </DropdownButton>
            <DropdownButton
              title={'Region' + (this.state.region ? ' - ' + this.state.region : '')}
              variant={'secondary'}
              disabled={!this.state.stage || this.state.loading}
              id={'dropdown-variants-primary'}
              key={'region'}
            >
              {(!this.state.stage ? [] : regions[this.state.stage]).map((region, index) => (
                <Dropdown.Item
                  key={region}
                  eventKey={index}
                  onSelect={() => this.setState({region})}
                >
                  {region}
                </Dropdown.Item>
              ))}
            </DropdownButton>
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
                  onSelect={() => this.setState({type})}
                >
                  {type}
                </Dropdown.Item>
              ))}
            </DropdownButton>
            <Button
              variant="primary"
              disabled={!this.state.stage || !this.state.region || !this.state.type || this.state.loading}
              onClick={async () => {
                this.setState({loading: true, empty: false});
                const {data} = await Ajax().fetch('/metering/get?stage=' + this.state.stage + '&region=' + this.state.region + '&type=' + this.state.type);
                this.setState({
                  notFoundMessages: data.notFoundMessages ? data.notFoundMessages : [],
                  foundMessages: data.foundMessages ? data.foundMessages : [],
                  messages: data.messages ? data.messages : [],
                  empty: !data.messages,
                  loading: false
                });
              }}
            >
              Get records
            </Button>
          </ButtonToolbar>
          {messages.length >= 10 && <div>10 messages were found in the queue, there could be more.</div>}
          {accounts.length > 0 && <div>There are <b>{accounts.length}</b> unique accounts <Button variant="primary" onClick={() => this.setState({showAccounts: !this.state.showAccounts})}>Show accounts</Button></div>}
          {this.state.showAccounts && <div>
            <AceEditor
              theme="dracula"
              name="ace_logs"
              value={accounts.join('\n')}
              minLines={accounts.length + 1}
              maxLines={accounts.length + 1}
              width={'100%'}
              showPrintMargin={false}
            />
          </div>}
          {this.state.type === 'REMO' && messagesAvailable && <div>
            <div className="metering-table">
              <h3>Messages from REMO event</h3>
              <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={foundList} columns={columns} expandRow={this.expandRow}/>
            </div>
            <div className="metering-table">
              <h3>Messages not from REMO event - bad</h3>
              <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={notFoundList} columns={columns} expandRow={this.expandRow}/>
            </div>
          </div>}
          {messagesAvailable && <div className="metering-table">
            <h3>All messages</h3>
            <BootstrapTable bootstrap4 striped keyField='MD5OfBody' condensed={true} data={messages} columns={columns} expandRow={this.expandRow}/>
          </div>}
          {this.state.empty && <div>No messages found in queue. There could be messages in flight, please wait a few then try again</div>}
          {this.state.deleteError && <div>
            Error during delete
            <AceEditor
              theme="dracula"
              name="ace_logs"
              value={JSON.stringify(this.state.deleteError, null, 4)}
              width={'100%'}
              showPrintMargin={false}
            />
          </div>}
        </div>
      </div>
    )
  }
}
