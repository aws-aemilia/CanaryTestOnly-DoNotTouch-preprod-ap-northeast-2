import React, { Component } from 'react';
import Table from '../../components/tables/table';
import Ajax from "../../ajax";
import Search from '../../components/search/search';
import StageRegionSelector from "../../components/stageRegionSelector";
import NavBar from "../../components/navbar";

import { ButtonToolbar, DropdownButton, Dropdown, Form } from "react-bootstrap";


class CustomerInformation extends Component {
    constructor(props) {
        super(props);
        this.state = {
            dataApp: {},
            search: '',
            loading: false,
            regions: [],
            stages: []
        }
        this.searchDataChanged = this.searchDataChanged.bind(this);
    }


    searchDataChanged(text) {
        this.setState({
            search: text
        }, () => {
            if (this.state.search) {
                this.getApiDataApp();
                this.getApiDataBranch();
            } else {
                this.setState({
                    dataApp: {},
                    dataBranch: {}
                })
            }
        });
    }

    // Define the query parameter
//     getAppId(){
//     const params = {
//         stage: this.state.stage,
//         region: this.state.region,
//         search: this.state.search,
//     };
// }

    async getApiDataApp() {
        try {
            const response = await Ajax().fetch(`/appcustomerinfo?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
            const {dataApp} = response;
            // const jsonData = await dataApp.json();
            console.log(dataApp);
            console.log("dataApp fetch")
            // const formatData = jsonData.reduce((acc, curr) => {
            //     return Object.assign(acc, curr)
            // }, {});
            this.setState({
                dataApp
            });
        } catch (error) {
            console.log(error);
            console.log("dataApp fetch fail")
            this.setState({
                dataApp: {}
            })
        }
    }

    async getApiDataBranch() {
        try {
            const response = await Ajax().fetch(`/branchcustomerinfo?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
            const {dataBranch} = response;
            // const jsonData = await dataBranch.json();
            console.log(dataBranch);
            console.log("dataBranch fetch")
            // const formatData = jsonData.reduce((acc, curr) => {
            //     return Object.assign(acc, curr)
            // }, {});
            this.setState({
                dataBranch
            });
        } catch (error) {
            console.log(error);
            console.log("dataBranch fetch fail")
            this.setState({
                dataBranch: {}
            })
        }
    }


    render() {
        return (
            <div>
                <StageRegionSelector
                    regions={this.props.regions}
                    stage={this.state.stage}
                    region={this.state.region}
                    loading={this.state.loading}
                    onStageChange={(stage) => this.setState({ stage, region: '' })}
                    onRegionChange={(region) => this.setState({ region })}
                >
                    <Search searchDataChanged={this.searchDataChanged} />
                </StageRegionSelector>
                <h4 style={this.tagStyle}>App Table</h4>
                <Table dataApp={this.state.dataApp} />
                <h4 style={this.tagStyle}>Branch Table</h4>
                <Table dataApp={this.state.dataBranch} />
                <h4 style={this.tagStyle}>Job Table</h4>
                <Table dataApp={this.state.dataApp} />
                <h4 style={this.tagStyle}>Domain Table</h4>
                <Table dataApp={this.state.dataApp} />
                <h4 style={this.tagStyle}>Webhook Table</h4>
                <Table dataApp={this.state.dataApp} />
            </div>
        )
    }
}

export default CustomerInformation;
