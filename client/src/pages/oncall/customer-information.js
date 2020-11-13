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



    async getApiData() {
        try {
   const promises = [];
   promises.add(Ajax().fetch(`/customerinfoApp?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`));
   promises.add(Ajax().fetch(`/customerinfoBranch?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)); 
   const [resultApp, resultBranch] = await Promise.all(promises);
            this.setState({
                appData: resultApp.data, 
                branchData: resultBranch.data
            });
        } catch (error) {
            console.log(error);
            console.log("data fetch fail");
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
                <Table data={this.state.appData} />
                <h4 style={this.tagStyle}>Branch Table</h4>
                <Table data={this.state.branchData} />
            </div>
        )
    }
}

export default CustomerInformation;