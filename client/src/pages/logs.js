import React, { Component } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import 'bootstrap/dist/css/bootstrap.css'
import _ from 'lodash';
import brace from 'brace';
import AceEditor from 'react-ace';

import 'brace/theme/dracula';

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
      fetch(`/api/logs?region=${params['region']}&logGroupName=${params['logGroupName']}&logStreamName=${params['logStreamName'].replace('|', '/')}`)
    .then(async res => {
        const json = await res.json();

        this.setState({'list': json['events']});
    });
  };

  render() {
    const { list } = this.state;

    console.log(JSON.stringify(list));

    return (
      <div className="App">
        <h1>List of Items</h1>
        {/* Check to see if any items are found*/}
        {list.length ? (
            <AceEditor
                theme="dracula"
                name="ace_logs"
                value={list.reduce((acc, event) => {
                    if (event.message.indexOf('......... .........') > 0) {
                        return acc;
                    } else {
                        return acc + event.message
                    }
                })}
                width={1024}
                height={768}
                showPrintMargin={false}
            />
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