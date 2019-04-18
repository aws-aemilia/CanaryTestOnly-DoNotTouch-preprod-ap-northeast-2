import React, { Component } from 'react';
import NavBar from '../components/navbar';
import Plot from 'react-plotly.js';
import _ from "lodash";


class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {
      'failuresWeek': null,
      'succeedsWeek': null,
      'datesWeek': null,
      'failuresMonth': null,
      'succeedsMonth': null,
      'datesMonth': null,
      'loadingWeek': true,
      'loadingMonth': true
    };
  }

  async componentDidMount() {
    await this.getFailureCountForWeek();
    await this.getFailureCountForMonth();
  }

  async getFailureCountForWeek() {
    let failuresWeek = [];
    let succeedsWeek = [];
    let datesWeek = [];

    for (let i=6; i>=0; i--) {
      let count = await this.getFailureCountForDays(2 + i, 1 + i);
      let passCount = await this.getSuccessCountForDays(2 + i, 1 + i);
      failuresWeek.push(count);
      succeedsWeek.push(passCount);

      var d = new Date();
      d.setDate(d.getDate()- (1 + i));
      datesWeek.push(d.toLocaleDateString('en-US'));
    }

    this.setState({
      'failuresWeek': failuresWeek,
      'succeedsWeek': succeedsWeek,
      'datesWeek': datesWeek,
      'loadingWeek': false
    });
  }

  async getFailureCountForMonth() {
    let failuresMonth = [];
    let succeedsMonth = [];
    let datesMonth = [];

    for (let i=30; i>=0; i--) {
      let count = await this.getFailureCountForDays(2 + i, 1 + i);
      let passCount = await this.getSuccessCountForDays(2 + i, 1 + i);
      failuresMonth.push(count);
      succeedsMonth.push(passCount);

      var d = new Date();
      d.setDate(d.getDate()- (1 + i));
      datesMonth.push(d.toLocaleDateString('en-US'));
    }

    this.setState({
      'failuresMonth': failuresMonth,
      'succeedsMonth': succeedsMonth,
      'datesMonth': datesMonth,
      'loadingMonth': false
    });
  }

  async getFailureCountForDays(from, to) {
    const res = await fetch(`/api/metrics/builds/failed?daysFrom=${from}&daysTo=${to}`);
    const json = await res.json();
    return Object.entries(_.groupBy(json.rows, 'appid')).length;
  }

  async getSuccessCountForDays(from, to) {
    const res = await fetch(`/api/metrics/builds/succeed?daysFrom=${from}&daysTo=${to}`);
    const json = await res.json();
    return Object.entries(_.groupBy(json.rows, 'appid')).length;
  }

  render() {
    const { failuresWeek, datesWeek, datesMonth, failuresMonth, loadingWeek, loadingMonth, succeedsWeek, succeedsMonth } = this.state;
    return (
    <div className="App">
      <NavBar/>
      <div>
        <Plot
            data={[
              {type: 'bar', x: datesWeek, y: failuresWeek},
            ]}
            layout={ {width: 640, height: 480, title: 'Customers With Failed Build (Last 7 Days)'} }
        />
        <Plot
            data={[
              {type: 'bar', x: datesMonth, y: failuresMonth},
            ]}
            layout={ {width: 640, height: 480, title: 'Customers With Failed Build (Last 30 Days)'} }
        />
      </div>
      <div>
        <Plot
            data={[
                {type: 'bar', x: datesWeek, y: failuresWeek ? failuresWeek.map((x, index) => x / succeedsWeek[index]) : []},
            ]}
            layout={ {width: 640, height: 480, title: 'Percent Failed Build (Last 7 Days)'} }
        />
        <Plot
            data={[
                {type: 'bar', x: datesMonth, y: failuresMonth ? failuresMonth.map((x, index) => x / succeedsMonth[index]) : []},
            ]}
            layout={ {width: 640, height: 480, title: 'Percent Failed Build (Last 30 Days)'} }
        />
      </div>
      </div>
    );
  }
}
export default Home;

