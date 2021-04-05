import React from 'react';
import {render} from 'react-dom';
import {HashRouter} from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import $ from 'jquery';
import Popper from 'popper.js';
import 'bootstrap/dist/js/bootstrap.bundle.min';
import './index.css';
import App from './App';

render((
    <HashRouter>
        <App/>
    </HashRouter>
), document.getElementById('root'));


