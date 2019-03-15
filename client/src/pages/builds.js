import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import NavBar from '../components/navbar';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCrosshairs, faUser} from "@fortawesome/free-solid-svg-icons";

class List extends Component {
  // Initialize the state
  constructor(props){
    super(props);
    this.state = {
        list: [],
        loading: true,
        error: false
    }
  }

  // Fetch the list on first mount
  componentDidMount() {
    this.getBuilds();
  }

  // Retrieves the list of items from the Express app
  getBuilds = () => {
      const { match: { params } } = this.props;
    fetch(`/api/builds?region=${params['region']}&project=${params['project']}`)
    .then(async res => {
        const json = await res.json();

        if (json['builds']) {
            const builds = json['builds'].map(item => {
                return {
                    'startTime': item.startTime,
                    'id': item.id,
                    'buildStatus': item.buildStatus,
                    'branch': item.environment.environmentVariables.find(element => element.name === 'AWS_BRANCH').value,
                    'buildId': item.environment.environmentVariables.find(element => element.name === 'AWS_JOB_ID').value,
                    'logs': item.logs
                };
            });

            this.setState({'list': builds});
        } else {
            this.setState({'error': true});
        }
    });
  };

    onTargetClick (row) {
        const { match: { params } } = this.props;
        window.location.href = `/logs/${params['region']}/${row.logs.groupName}/${row.logs.streamName.replace('/', '|')}`;
    }

    actionFormatter = (cell, row) => {
        return (
            <div>
                <div style={{display: 'inline-block', cursor: 'pointer'}} onClick={()=> this.onTargetClick(row)}><FontAwesomeIcon icon={faCrosshairs}/></div>
            </div>
        );
    };

  render() {
    const { list, loading, error } = this.state;
      const { match: { params } } = this.props;
    const columns = [
        {dataField: 'startTime', text: 'Timestamp', sort: true},
        {dataField: 'id', text: 'CodeBuild ID'},
        {dataField: 'buildId', text: 'Amplify ID'},
        {dataField: 'branch', text: 'Branch'},
        {dataField: 'buildStatus', text: 'Build Status'},
        {formatter: this.actionFormatter}
      ];
      const defaultSorted = [{
          dataField: 'startTime',
          order: 'desc'
      }];

    return (
      <div className="App">
          <NavBar/>
          {list && list.length ? (
              <BootstrapTable bootstrap4 striped keyField='appid' condensed={true} data={list} columns={columns}
                              defaultSorted={defaultSorted}/>
          ) : (
              loading && !error ? (
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
            Error: Project no longer exists
        </div>
            ) : (<div/>)
        }
      </div>
    );
  }
}

export default List;