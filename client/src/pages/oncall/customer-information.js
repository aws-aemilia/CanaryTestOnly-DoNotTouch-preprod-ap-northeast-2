import React, { Component } from 'react';
import Table from '../../components/tables/table';
import Ajax from "../../ajax";
import Search from '../../components/search/search';
import StageRegionSelector from "../../components/stageRegionSelector";
import NavBar from "../../components/navbar";
import { ButtonToolbar, DropdownButton, Dropdown, Form } from "react-bootstrap";
import { counter } from '@fortawesome/fontawesome-svg-core';

class CustomerInformation extends Component {
    constructor(props) {
        super(props);
        this.state = {
            data: {},
            appData: {},
            branchData: [],
            domainData: [],
            webhookData: [],
            lambdaData: {},
            jobData: [],
            search: '',
            loading: false,
            regions: [],
            stages: [],
            tableData: {},
            tablename: {},
            counter : 0
        }
        this.searchDataChanged = this.searchDataChanged.bind(this);
    }

    remove(obj, key) {
        for (var k in obj) {
            if (k==key) {
                delete obj[k];
            }
            else if (typeof obj[k] === 'object') {
                this.remove(obj[k], key);
            }
        }
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
            

            try {
                const appPromises = [Ajax().fetch(`/customerinfoApp?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)];
                const resultApp = await Promise.all(appPromises);
                console.log("resultApp", resultApp)
                this.setState({appData : resultApp.data})
            }
            catch (appError) {
                console.log("app table fetch error", appError)
            }
            try {
                const branchPromises = [Ajax().fetch(`/customerinfoBranch?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)];
                const resultBranch = await Promise.all(branchPromises)
                console.log("resultBranch", resultBranch)
                this.setState({branchData : resultBranch.data})
            }
            catch (branchError) {
                console.log("branch table fetch error", branchError)
            }
            try {
                const domainPromises = [Ajax().fetch(`/customerinfoDomain?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)];
                const resultDomain = await Promise.all(domainPromises)
                console.log("resultDomain", resultDomain)
                this.setState({domainData : resultDomain.data})
            }
            catch (domainError) {
                console.log("domain table fetch error", domainError)
            }
            try {
                const webhookPromises = [Ajax().fetch(`/customerinfoWebhook?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)];
                const resultWebhook = await Promise.all(webhookPromises)
				console.log("resultWebhook", resultWebhook)
				this.setState({webhookData : resultWebhook.data})
            }
            catch (webhookError) {
                console.log("webhook table fetch error", webhookError)
            }
            try {
                const lambdaPromises = [Ajax().fetch(`/customerinfoLambdaEdgeConfig?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`)];
				const resultLambda = await Promise.all(lambdaPromises)
				console.log("resultLambda", resultLambda)
				this.setState({lambdaData : resultLambda.data})
            }
            catch (lambdaEdgeConfigError) {
                console.log("lambdaEdgeConfig table fetch error", lambdaEdgeConfigError)
            }
			try {
				const jobPromises = this.state.branchData.map(branch => Ajax().fetch(`/customerinfoJob?stage=${this.state.stage}&region=${this.state.region}&query=${branch.branchArn}`));
				const jobResults = await Promise.all(jobPromises);
				console.log("jobResults", jobResults)
				const getJobData = jobResults.map(job => job.data);
				let getJobDataValue = [];
				getJobData.forEach(obj => {
					for (const [key, value] of Object.entries(obj)) {
                    getJobDataValue.push(value)
                }
				});
				console.log("getJobDataValue", getJobDataValue)
				this.setState({jobData: getJobDataValue})
			}
			catch (jobError) {
				console.log("job table fetch error", jobError)
			}
			
            
           
            
            console.log("testing number of jobs runnning counter")
            
            const count = this.state.jobData.filter((obj) => obj.jobSteps.jobStatus === "SUCCEED").length;
			this.setState({counter: count})
            console.log("count", count);
            
        } catch (error) {
            console.log(error);
            console.log("data fetch fail");
        }
    }

    

    render() {
        return (
            <div style={{ width: "85%", margin: "0 auto" }}>
                <h1>
                    <span>Customer Information</span>
                    {' '}
                    <small>Customer Configuration and Settings</small>
                </h1>
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
                { this.state.branchData.map((tableData => <Table tablename={"branchName"} data={tableData} />))}
                <h4 style={this.tagStyle}>Domain Table</h4>
                { this.state.domainData.map((tableData => <Table tablename={"domainName"} data={tableData} />))}
                <h4 style={this.tagStyle}>Webhook Table</h4>
                { this.state.webhookData.map((tableData => <Table tablename={"webhookId"} data={tableData} />))}
                <h4 style={this.tagStyle}>LambdaEdgeConfig Table</h4>
                <Table data={this.state.lambdaData} />
                <h4 style={this.tagStyle}>Job Table</h4>
                { this.state.jobData.map((tableData => <Table tablename={"jobId"} data={tableData} />))}
                <h4 style={this.tagStyle}>Number of Jobs Running: {this.state.counter}</h4>
                
            </div>
        )
    }
}

export default CustomerInformation;