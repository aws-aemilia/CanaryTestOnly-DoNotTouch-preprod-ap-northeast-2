import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import NavBar from '../components/navbar';

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

        console.log(JSON.stringify(json));

        if (json['builds']) {
            this.setState({'list': json['builds']});
        } else {
            this.setState({'error': true});
        }
    });
  };

  render() {
    const { list, loading, error } = this.state;
      const { match: { params } } = this.props;
    const columns = [
        {dataField: 'startTime', text: 'First Build', sort: true},
        {dataField: 'id', text: 'Build ID'},
        {dataField: 'buildStatus', text: 'Build Status'},
      ];
      const defaultSorted = [{
          dataField: 'startTime',
          order: 'desc'
      }];
      const rowEvents = {
          onClick: (e, row, rowIndex) => {
              const { match: { params } } = this.props;
              window.location.href = `/logs/${params['region']}/${row.logs.groupName}/${row.logs.streamName.replace('/', '|')}`;
          }
      };

    return (
      <div className="App">
          <NavBar/>
          {list && list.length ? (
              <BootstrapTable bootstrap4 striped hover keyField='appid' data={list} columns={columns}
                              defaultSorted={defaultSorted} rowEvents={rowEvents}/>
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