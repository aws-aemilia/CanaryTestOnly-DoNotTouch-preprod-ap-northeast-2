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
    this.getBuilds();
  }

  // Retrieves the list of items from the Express app
  getBuilds = () => {
      const { match: { params } } = this.props;
    fetch(`/api/builds?region=${params['region']}&project=${params['project']}`)
    .then(async res => {
        const json = await res.json();

        console.log(JSON.stringify(json));

        this.setState({'list': json['builds']});
    });
  };

  render() {
    const { list } = this.state;
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
        <h1>List of Items</h1>
        {/* Check to see if any items are found*/}
        {list.length ? (
            <BootstrapTable bootstrap4 striped hover keyField='appid' data={ list } columns={ columns } defaultSorted={ defaultSorted } rowEvents={rowEvents}/>
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