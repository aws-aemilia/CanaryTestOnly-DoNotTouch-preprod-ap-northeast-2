import React, {Component} from 'react';
import 'bootstrap/dist/css/bootstrap.css'
import NavBar from '../components/navbar';
import Plot from 'react-plotly.js';
import _ from "lodash";
import Ajax from '../ajax';
import {CancelToken} from 'axios';

class Home extends Component {
    cancelMessage = 'Component unmounted';

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
            'loadingMonth': true,
            'weekAccounts': null,
            'monthAccounts': null
        };
        this.source = CancelToken.source();
    }

    componentWillUnmount() {
        if (this.source) {
            this.source.cancel(this.cancelMessage);
        }
    }

    async componentDidMount() {
        this.getAllBuilds();
        this.getFailureCountForWeek();
        this.getFailureCountForMonth();
    }

    async getFailureCountForWeek() {
        let failuresWeek = [];
        let succeedsWeek = [];
        let datesWeek = [];
        let weekBuilds = [];

        try {
            for (let i = 6; i >= 0; i--) {
                let count = await this.getFailureCountForDays(2 + i, 1 + i);
                let {builds, passCount} = await this.getSuccessCountForDays(2 + i, 1 + i);
                failuresWeek.push(count);
                succeedsWeek.push(passCount);
                weekBuilds = [
                    ...weekBuilds,
                    builds
                ];

                var d = new Date();
                d.setDate(d.getDate() - (1 + i));
                datesWeek.push(d.toLocaleDateString('en-US'));
            }

            this.setState({
                'failuresWeek': failuresWeek,
                'succeedsWeek': succeedsWeek,
                'datesWeek': datesWeek,
                'loadingWeek': false
            });

            let accounts = [];
            weekBuilds.forEach((result) => result.rows.forEach(({accountid}) => accounts.indexOf(accountid) >= 0 ? undefined : accounts.push(accountid)));
            this.setState({
                weekAccounts: accounts.length
            });
        } catch (e) {
            if (e.message !== this.cancelMessage) {
                throw(e);
            }
        }
    }

    async getFailureCountForMonth() {
        let failuresMonth = [];
        let succeedsMonth = [];
        let datesMonth = [];
        let monthBuilds = [];

        try {
            for (let i = 30; i >= 0; i--) {
                let count = await this.getFailureCountForDays(2 + i, 1 + i);
                let {builds, passCount} = await this.getSuccessCountForDays(2 + i, 1 + i);
                failuresMonth.push(count);
                succeedsMonth.push(passCount);
                monthBuilds = [
                    ...monthBuilds,
                    builds
                ];

                var d = new Date();
                d.setDate(d.getDate() - (1 + i));
                datesMonth.push(d.toLocaleDateString('en-US'));
            }

            this.setState({
                'failuresMonth': failuresMonth,
                'succeedsMonth': succeedsMonth,
                'datesMonth': datesMonth,
                'loadingMonth': false
            });

            let accounts = [];
            monthBuilds.forEach((result) => result.rows.forEach(({accountid}) => accounts.indexOf(accountid) >= 0 ? undefined : accounts.push(accountid)));

            this.setState({
                monthAccounts: accounts.length
            });
        } catch (e) {
            if (e.message !== this.cancelMessage) {
                throw(e);
            }
        }
    }

    async getFailureCountForDays(from, to) {
        const {data} = await Ajax().fetch(`/api/metrics/builds/failed?daysFrom=${from}&daysTo=${to}`, {cancelToken: this.source.token});
        return Object.entries(_.groupBy(data.rows, 'appid')).length;
    }

    async getSuccessCountForDays(from, to) {
        const {data} = await Ajax().fetch(`/api/metrics/builds/succeed?daysFrom=${from}&daysTo=${to}`, {cancelToken: this.source.token});
        return {builds: data, passCount: Object.entries(_.groupBy(data.rows, 'appid')).length};
    }

    async getAllBuilds() {
        const {data} = await Ajax().fetch(`/api/metrics/builds/succeed`, {cancelToken: this.source.token});
        return {builds: data, passCount: Object.entries(_.groupBy(data.rows, 'appid')).length};
    }

    render() {
        const {failuresWeek, datesWeek, datesMonth, failuresMonth, succeedsWeek, succeedsMonth, weekAccounts, monthAccounts} = this.state;
        return (
            <div className="App">
                <NavBar/>
                <div>
                    <div>Unique week accounts: {weekAccounts}</div>
                    <div>Unique month accounts: {monthAccounts}</div>
                </div>
                <div>
                    <Plot
                        data={[
                            {type: 'bar', x: datesWeek, y: failuresWeek},
                        ]}
                        layout={{width: 640, height: 480, title: 'Customers With Failed Build (Last 7 Days)'}}
                    />
                    <Plot
                        data={[
                            {type: 'bar', x: datesMonth, y: failuresMonth},
                        ]}
                        layout={{width: 640, height: 480, title: 'Customers With Failed Build (Last 30 Days)'}}
                    />
                </div>
                <div>
                    <Plot
                        data={[
                            {
                                type: 'bar',
                                x: datesWeek,
                                y: failuresWeek ? failuresWeek.map((x, index) => x / succeedsWeek[index]) : []
                            },
                        ]}
                        layout={{width: 640, height: 480, title: 'Percent Failed Build (Last 7 Days)'}}
                    />
                    <Plot
                        data={[
                            {
                                type: 'bar',
                                x: datesMonth,
                                y: failuresMonth ? failuresMonth.map((x, index) => x / succeedsMonth[index]) : []
                            },
                        ]}
                        layout={{width: 640, height: 480, title: 'Percent Failed Build (Last 30 Days)'}}
                    />
                </div>
            </div>
        );
    }
}

export default Home;

