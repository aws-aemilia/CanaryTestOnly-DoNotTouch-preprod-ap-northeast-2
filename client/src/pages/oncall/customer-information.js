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
            appData: {},
            branchData: [],
            domainData: [],
            jobData: [],
            search: '',
            loading: false,
            regions: [],
            stages: [],
            tableData: {},
            tablename: {},
            branch: ''
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
            const jobPromises =[];
            promises.push(Ajax().fetch(`/customerinfoApp?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`));
            promises.push(Ajax().fetch(`/customerinfoBranch?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`));
            promises.push(Ajax().fetch(`/customerinfoDomain?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`));
            // promises.push(Ajax().fetch(`/customerinfoJob?stage=${this.state.stage}&region=${this.state.region}&branchArn=${this.state.branch}`));
            const [resultApp, resultBranch, resultDomain] = await Promise.all(promises);
            jobPromises.push.resultBranch.map(branch => Ajax().fetch(`/customerinfoJob?stage=${this.state.stage}&region=${this.state.region}&branchArn=${branch.branchArn}`));
            const [jobResults] = await Promise.all(jobPromises);

            this.setState({
                appData: resultApp.data,
                branchData: resultBranch.data,
                domainData: resultDomain.data,
                jobData: jobResults.data
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
                { this.state.branchData.map((tableData => <Table tablename={"branchName"} data={tableData}/>)) }
                <h4 style={this.tagStyle}>Domain Table</h4>
                { this.state.domainData.map((tableData => <Table tablename={"domainName"} data={tableData}/>)) }
                <h4 style={this.tagStyle}>Job Table</h4>
                { this.state.jobData.map((tableData => <Table tablename={"jobId"} data={tableData}/>)) }

            </div>
        )
    }
}

export default CustomerInformation;