import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';
import NavBar from '../components/navbar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCrosshairs } from '@fortawesome/free-solid-svg-icons'
import { faUser } from '@fortawesome/free-solid-svg-icons'

class Failures extends Component {
  // Initialize the state
  constructor(props){
    super(props);
    this.state = {
        list: null,
        loading: true,
        days: null,
        error: false
    };
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

    onTargetClick (row) {
        window.location.href = `/builds/${row.region}/${row.appid}`;
    }

    onUserClick(row) {
        window.location.href = `https://aws-tools.amazon.com/servicetools/search.aws?searchType=ACCOUNT&query=${row.accountid}`;
    }

  actionFormatter = (cell, row) => {
      return (
        <div>
            <div style={{display: 'inline-block', cursor: 'pointer'}} onClick={()=> this.onTargetClick(row)}><FontAwesomeIcon icon={faCrosshairs}/></div>
            &nbsp;
            <div style={{display: 'inline-block', cursor: 'pointer'}} onClick={()=> this.onUserClick(row)}><FontAwesomeIcon icon={faUser}/></div>
        </div>
      );
    };

  render() {
    const { list, loading, error } = this.state;
    const columns = [
        {dataField: 'timestamp', text: 'First Build', sort: true},
        {dataField: 'appid', text: 'App ID'},
        {dataField: 'count', text: 'Failures', sort: true},
        {dataField: 'accountid', text: 'Account ID', sort: true},
        {dataField: 'region', text: 'Region'},
        {formatter: this.actionFormatter}
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
                <BootstrapTable bootstrap4 striped keyField='appid' condensed={true} data={ list } columns={ columns } defaultSorted={ defaultSorted }/>
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