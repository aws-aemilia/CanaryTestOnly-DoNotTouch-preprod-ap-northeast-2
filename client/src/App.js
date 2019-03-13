import React, { Component } from 'react';
import { Route, Switch } from 'react-router-dom';
import './App.css';
import Home from './pages/home';
import Failures from './pages/failures';
import Builds from './pages/builds';
import Logs from './pages/logs';

class App extends Component {
  render() {
    const App = () => (
      <div>
        <Switch>
          <Route exact path='/' component={Home}/>
          <Route path='/failures/account/:accountId' component={Failures}/>
          <Route path='/failures/app/:appId' component={Failures}/>
          <Route path='/failures/days/:days' component={Failures}/>
            <Route path='/failures' component={Failures}/>
          <Route path='/builds/:region/:project' component={Builds}/>
          <Route path='/logs/:region/:logGroupName/:logStreamName' component={Logs}/>
        </Switch>
      </div>
    );
    return (
      <Switch>
        <App/>
      </Switch>
    );
  }
}

export default App;

