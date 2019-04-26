import React, { Component } from 'react';
import Home from "../pages/home";

class NavBar extends Component {
    constructor(props) {
        super(props);
        this.state = {search: ''};

        this.handleSubmitSearch = this.handleSubmitSearch.bind(this);
        this.handleChangeSearch = this.handleChangeSearch.bind(this);
    }

    handleChangeSearch(event) {
        this.setState({search: event.target.value});
    }

    handleSubmitSearch(event) {
        if (this.state.search.match(/[0-9]/g).length === this.state.search.length) {
            window.location.href = `/failures/account/${this.state.search}`;
        } else {
            window.location.href = `/failures/app/${this.state.search}`;
        }

        event.preventDefault();
    }

    render() {
        return (
            <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
                <a className="navbar-brand" href="/">AC Analytics</a>
                <button className="navbar-toggler" type="button" data-toggle="collapse"
                        data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent"
                        aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul className="navbar-nav mr-auto">
                        <li className="nav-item active">
                            <a className="nav-link" href="/">Home <span className="sr-only">(current)</span></a>
                        </li>
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                               data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                Build Failures
                            </a>
                            <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                                <a className="dropdown-item" href="/failures/days/1">Last Day</a>
                                <a className="dropdown-item" href="/failures/days/7">Last 7 Days</a>
                                <a className="dropdown-item" href="/failures/days/30">Last 30 Days</a>
                            </div>
                        </li>
                    </ul>
                    <form className="form-inline my-2 my-lg-0" onSubmit={this.handleSubmitSearch}>
                        <input className="form-control mr-sm-2" type="search" placeholder="Account / App ID" aria-label="Account / App ID" onChange={this.handleChangeSearch}/>
                        <button className="btn btn-outline-success my-2 my-sm-0" type="submit">Search</button>
                    </form>
                </div>
            </nav>
        )
    }
}

export default NavBar;
