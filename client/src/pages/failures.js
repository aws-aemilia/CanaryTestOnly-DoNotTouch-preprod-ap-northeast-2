import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';

class Failures extends Component {
  // Initialize the state
  constructor(props){
    super(props);
    this.state = {
        list: [],
        loading: true
    }
  }

  // Fetch the list on first mount
  componentDidMount() {
    this.getList();
  }

  // Retrieves the list of items from the Express app
  getList = () => {
      const { match: { params } } = this.props;
      const url = params['accountId'] ? `/api/metrics/builds/failed?accountId=${params['accountId']}` : '/api/metrics/builds/failed';
      fetch(url)
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
  };

  render() {
    const { list, loading } = this.state;
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
      const rowEvents = {
          onClick: (e, row, rowIndex) => {
              window.location.href = `/builds/${row.region}/${row.appid}`;
          }
      };

    return (
      <div className="App">
        <h3>Build Failure Count by Account ID</h3>
        {list && list.length ? (
            <BootstrapTable bootstrap4 striped hover keyField='appid' data={ list } columns={ columns } defaultSorted={ defaultSorted } rowEvents={rowEvents}/>
        ) : (
            loading ? (
                    <h4>Loading...</h4>
                ) : (
                    <div>
                        <h4>Nothing found</h4>
                    </div>
                )
        )
      }
      </div>
    );
  }
}

export default Failures;