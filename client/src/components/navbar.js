import React, {Component} from 'react';
import {Link, withRouter} from 'react-router-dom';
import Ajax from "../ajax";

class NavBar extends Component {
    constructor(props) {
        super(props);
        this.state = {search: '', username: ''};

        this.handleSubmitSearch = this.handleSubmitSearch.bind(this);
        this.handleChangeSearch = this.handleChangeSearch.bind(this);
    }

    componentWillMount() {
        Ajax().fetch({
            method: 'GET',
            url: '/username'
        })
            .then((result) => this.setState({username: result.data}))
            .catch((err) => console.log(err));
    }

    handleChangeSearch(event) {
        this.setState({search: event.target.value});
    }

    handleSubmitSearch(event) {
        if (this.state.search.match(/[0-9]/g).length === this.state.search.length) {
            this.props.history.push(`/failures/account/${this.state.search}`);
        } else {
            this.props.history.push(`/failures/app/${this.state.search}`);
        }

        event.preventDefault();
    }

    render() {
        const path = this.props.location.pathname;
        return (
            <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
                <Link className="navbar-brand" to="/">AC Analytics</Link>
                <button className="navbar-toggler" type="button" data-toggle="collapse"
                        data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent"
                        aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"/>
                </button>

                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul className="navbar-nav mr-auto">
                        <li className={`nav-item ${path === '/' ? 'active' : ''}`}>
                            <Link className="nav-link" to="/">Home <span className="sr-only">(current)</span></Link>
                        </li>
                        <li className={`nav-item dropdown ${path.indexOf('/failures') >= 0 ? 'active' : ''}`}>
                            <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                               data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                Build Failures
                            </a>
                            <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                                <Link className="dropdown-item" to="/failures/days/1">Last Day</Link>
                                <Link className="dropdown-item" to="/failures/days/7">Last 7 Days</Link>
                                <Link className="dropdown-item" to="/failures/days/30">Last 30 Days</Link>
                            </div>
                        </li>
                        <li className={`nav-item dropdown ${path.indexOf('/oncall') >= 0 ? 'active' : ''}`}>
                            <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                               data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                OnCall
                            </a>
                            <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                                <Link className="dropdown-item" to="/oncall/metering">Metering</Link>
                                <Link className="dropdown-item" to="/oncall/impact">Customer impact</Link>
                            </div>
                        </li>
                    </ul>
                    <form className="form-inline my-2 my-lg-0" onSubmit={this.handleSubmitSearch}>
                        <input className="form-control mr-sm-2" type="search" placeholder="Account / App ID"
                               aria-label="Account / App ID" onChange={this.handleChangeSearch}/>
                        <button className="btn btn-outline-success my-2 my-sm-0" type="submit">Search</button>
                    </form>
                </div>
            </nav>
        )
    }
}

export default withRouter(NavBar);
