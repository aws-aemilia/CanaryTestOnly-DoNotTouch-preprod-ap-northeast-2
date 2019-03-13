import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';
import NavBar from '../components/navbar';

class Failures extends Component {
  // Initialize the state
  constructor(props){
    super(props);
    this.state = {
        list: null,
        loading: true,
        days: null,
        error: false
    }
  }

  componentDidMount() {
    this.getList();
  }

  getList = () => {
      const { match: { params } } = this.props;
      let url = null;

      const days = params['days'] ? params['days'] : 7;
      this.setState({ 'days': days});

      if (params['accountId']) {
          url = `/api/metrics/builds/failed?accountId=${params['accountId']}`;
      } else if (params['appId']) {
          url = `/api/metrics/builds/failed?appId=${params['appId']}`;
      } else {
          url = '/api/metrics/builds/failed?days=' + days;
      }

      fetch(url)
    .then(async res => {
      const json = await res.json();

      if (json.rows.length <= 0) {
          this.setState({ 'error': true, 'loading': false });
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
          items: _.uniqBy(item[1], 'jobid').sort((a, b) => a.jobid - b.jobid)
        }
      });
    })
    .then(list => this.setState({ list }))
  };

  updateDays(days) {
      this.setState({ 'days': days, 'loading': true, 'list': [] }, this.getList);
  }

  render() {
    const { list, loading, error } = this.state;
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
        <NavBar/>
        {list && list.length ? (
            <div>
                <BootstrapTable bootstrap4 striped hover keyField='appid' data={ list } columns={ columns } defaultSorted={ defaultSorted } rowEvents={rowEvents}/>
            </div>
        ) : (
            loading ? (
                <div className="spinner-grow text-primary" role="status">
                    <span className="sr-only">Loading...</span>
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