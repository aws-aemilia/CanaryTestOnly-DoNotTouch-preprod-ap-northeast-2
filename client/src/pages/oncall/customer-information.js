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
            data: {},
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
                this.getApiData();
            } else {
                this.setState({
                    data: {}
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

    async getApiData() {
        try {
            const response = await Ajax().fetch(`/customerinfoApp?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
            const {data} = response;
            console.log(data);
            console.log("data fetch")
            this.setState({
                data
            });
        } catch (error) {
            console.log(error);
            console.log("data fetch fail")
            this.setState({
                data: {}
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
                <Table data={this.state.data} />
                <h4 style={this.tagStyle}>Branch Table</h4>
                <Table data={this.state.data} />
                <h4 style={this.tagStyle}>Job Table</h4>
                <Table data={this.state.data} />
                <h4 style={this.tagStyle}>Domain Table</h4>
                <Table data={this.state.data} />
                <h4 style={this.tagStyle}>Webhook Table</h4>
                <Table data={this.state.data} />
            </div>
        )
    }
}

export default CustomerInformation;
