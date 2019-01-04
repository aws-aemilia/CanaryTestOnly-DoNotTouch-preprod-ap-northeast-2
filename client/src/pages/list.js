import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';

class List extends Component {
  // Initialize the state
  constructor(props){
    super(props);
    this.state = {
      list: []
    }
  }

  // Fetch the list on first mount
  componentDidMount() {
    this.getList();
  }

  // Retrieves the list of items from the Express app
  getList = () => {
    fetch('/api/metrics/builds/failed')
    .then(async res => {
      const json = await res.json();

      return Object.entries(_.groupBy(json.rows, 'appid')).map(item => {
        return {
          count: _.uniqBy(item[1], 'jobid').length,
          appid: item[0],
          timestamp: item[1][0].timestamp,
          accountid: item[1][0].accountid,
          jobid: item[1][0].jobid,
          region: item[1][0].region,
          items: _.uniqBy(item[1], 'jobid').sort((a, b) => a.jobid - b.jobid)
        }
      });
    })
    .then(list => this.setState({ list }))
  }

  render() {
    const { list } = this.state;
    const columns = [
        {dataField: 'timestamp', text: 'First Build', sort: true},
        {dataField: 'appid', text: 'App ID'},
        {dataField: 'count', text: 'Count', sort: true},
        {dataField: 'accountid', text: 'Account ID', sort: true},
        {dataField: 'region', text: 'Region'}
      ];
      const defaultSorted = [{
          dataField: 'count',
          order: 'desc'
      }];
      const expandRow = {
          renderer: row => {
              const expandColumns = [
                  {dataField: 'timestamp', text: 'Timestamp'},
                  {dataField: 'jobid', text: 'Job ID'},
                  {dataField: 'buildtimeminutes', text: 'Build Time'},
              ];

            return (
              <div>
                  <BootstrapTable keyField='id' data={ row.items } columns={ expandColumns }/>
              </div>
          )}
      };


    return (
      <div className="App">
        <h1>List of Items</h1>
        {/* Check to see if any items are found*/}
        {list.length ? (
            <BootstrapTable bootstrap4 striped hover keyField='appid' data={ list } columns={ columns } expandRow={ expandRow } defaultSorted={ defaultSorted }/>
        ) : (
          <div>
            <h2>No List Items Found</h2>
          </div>
        )
      }
      </div>
    );
  }
}

export default List;