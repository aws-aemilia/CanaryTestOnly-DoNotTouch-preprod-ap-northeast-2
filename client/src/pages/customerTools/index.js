import React, {Component} from 'react';
import {Route, Switch, withRouter} from 'react-router-dom';
import NavBar from '../../components/navbar';
import Ajax from "../../ajax";
import Impact from './impact';
import CustomerInformation from './customer-information';
import Insights from './insights';

class CustomerTools extends Component {
    constructor(props) {
        super(props);
        this.state = {
            regions: {}
        };
    }

    componentDidMount() {
        this.getRegions();
    }

    async getRegions() {
        const {data: regions} = await Ajax().fetch('/regions');
        this.setState({regions});
    }

    render() {
        return (
            <div>
                <NavBar/>
                <Switch>
                    <Switch>
                        <Route path={this.props.match.path + '/impact'}
                               render={(props) => <Impact {...props} regions={this.state.regions}/>}/>
                        <Route path={this.props.match.path + "/customer-information"} render={(props) => <CustomerInformation {...props} regions={this.state.regions}/>}/>
                        <Route path={this.props.match.path + '/insights'}
                               render={(props) => <Insights {...props} regions={this.state.regions}/>}/>
                    </Switch>
                </Switch>
            </div>
        );
    }
}

export default withRouter(CustomerTools);