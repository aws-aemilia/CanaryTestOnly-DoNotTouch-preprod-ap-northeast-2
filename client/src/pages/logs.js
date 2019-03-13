import React, { Component } from 'react';
import 'bootstrap/dist/css/bootstrap.css'
import '../App.css'
import AceEditor from 'react-ace';
import NavBar from '../components/navbar';

import 'brace/theme/dracula';

class List extends Component {
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
    const { list, loading } = this.state;

    console.log(JSON.stringify(list));

    return (
      <div className="App">
        <NavBar/>
        {/* Check to see if any items are found*/}
        {list && list.length ? (
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
                width={'100%'}
                height={768}
                showPrintMargin={false}
            />
        ) : (
            loading ? (
                <div className="spinner-grow text-primary" role="status">
                  <span className="sr-only">Loading...</span>
                </div>
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

export default List;