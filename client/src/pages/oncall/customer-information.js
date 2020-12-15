import React, { Component } from 'react';
import Table from '../../components/tables/table';
import Ajax from "../../ajax";
import Search from '../../components/search/search';
import StageRegionSelector from "../../components/stageRegionSelector";

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
            appDataToggled: true,
            branchTableToggled: true,
            domainTableToggled: true,
            webhookTableToggled: true,
            LambdaEdgeToggled: true,
            jobTableToggled: true,
            numOfJobs: 0,
            jobSearch: ""
        }
        this.searchDataChanged = this.searchDataChanged.bind(this);
        this.handleJobSearch = this.handleJobSearch.bind(this)
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

    searchFun() {
        let filter = document.getElementById('myInput').value.toUpperCase();

        let myTable = document.getElementById('jobTable');

        let tr = myTable.getElementsByTagName('tr');

        for (var i = 0; i < tr.length; i++) {
            let td = tr[i].getElementsByTagName('td')[0];

            if (td) {
                let textValue = td.textContent || td.innerHTML;

                if (textValue.toUpperCase().indexOf(filter) > -1) {
                    tr[i].style.display = "";
                }
                else {
                    tr[i].style.display = "none";
                }
            }
        }
    }

    async getApiData() {
        try {
            try {
                const appPromise = Ajax().fetch(`/customerinfoApp?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
                const resultApp = await appPromise;
                console.log("resultApp", resultApp)
                this.setState({ appData: resultApp.data })
            }
            catch (appError) {
                console.log("app table fetch error", appError)
            }
            try {
                const branchPromises = Ajax().fetch(`/customerinfoBranch?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
                const resultBranch = await branchPromises
                console.log("resultBranch", resultBranch)
                this.setState({ branchData: resultBranch.data })
            }
            catch (branchError) {
                console.log("branch table fetch error", branchError)
            }
            try {
                const domainPromises = Ajax().fetch(`/customerinfoDomain?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
                const resultDomain = await domainPromises
                console.log("resultDomain", resultDomain)
                this.setState({ domainData: resultDomain.data })
            }
            catch (domainError) {
                console.log("domain table fetch error", domainError)
            }
            try {
                const webhookPromises = Ajax().fetch(`/customerinfoWebhook?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
                const resultWebhook = await webhookPromises
                console.log("resultWebhook", resultWebhook)
                this.setState({ webhookData: resultWebhook.data })
            }
            catch (webhookError) {
                console.log("webhook table fetch error", webhookError)
                this.setState({ webhookData: null })
            }
            try {
                const lambdaPromises = Ajax().fetch(`/customerinfoLambdaEdgeConfig?stage=${this.state.stage}&region=${this.state.region}&query=${this.state.search}`);
                const resultLambda = await lambdaPromises
                console.log("resultLambda", resultLambda)
                this.setState({ lambdaData: resultLambda.data })
            }
            catch (lambdaEdgeConfigError) {
                console.log("lambdaEdgeConfig table fetch error", lambdaEdgeConfigError)
                this.setState({ lambdaData: null })
            }
            try {
                const jobPromises = this.state.branchData.map(branch => Ajax().fetch(`/customerinfoJob?stage=${this.state.stage}&region=${this.state.region}&query=${branch.branchArn}`));
                const jobResults = await Promise.all(jobPromises);
                const getJobData = jobResults.map(job => job.data);
                let getJobDataValue = [];
                getJobData.forEach(obj => {
                    for (const [key, value] of Object.entries(obj)) {
                        getJobDataValue.push(value)
                    }
                });
                this.setState({ jobData: getJobDataValue })

                let getNumOfJobs = 0;
                getJobDataValue.forEach(g => {
                    g.jobSteps.forEach(j => {
                        if (j.jobStatus === "RUNNING") {
                            getNumOfJobs = getNumOfJobs += 1;
                        }
                    })
                })

                this.setState({ numOfJobs: getNumOfJobs })
            }
            catch (jobError) {
                console.log("job table fetch error", jobError)
            }
        } catch (error) {
            console.log(error);
            console.log("data fetch fail");
        }
    }

    handleJobSearch(event) {
        let value = event.target.value

        const filteredJob = this.state.jobData.map(j => {
            return Object.keys(j).reduce((r, e) => {
                if (j[e].toLowerCase().includes(value.toLowerCase())) r[e] = j[e]
                return r;
            }, {})
        })

        console.log("filtered", filteredJob)

        this.setState({ jobSearch: value })
    }

    render() {
        const { appData, branchData, domainData, webhookData, lambdaData, jobData, appDataToggled, branchTableToggled, domainTableToggled, webhookTableToggled, LambdaEdgeToggled, jobTableToggled, numOfJobs, jobSearch } = this.state;

        const flexStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" };
        const toggleStyle = { outline: "none", border: "none", padding: "2px 12px", borderRadius: "4px", backgroundColor: "#0d6efd", color: "white", fontSize: "22px", fontWeight: "bold" }
        return (
            <div style={{ width: "85%", margin: "0 auto" }}>
                <h1>
                    <span>Customer Information</span>
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
                {this.state.search !== '' && (
                    <>
                        {Object.keys(appData).length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>App Table</h4>
                                {appDataToggled ? <button style={toggleStyle} onClick={() => this.setState({ appDataToggled: false })}>-</button> : <button onClick={() => this.setState({ appDataToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {appDataToggled && <Table data={this.state.appData} />}

                        {branchData.length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>Branch Table</h4>
                                {branchTableToggled ? <button style={toggleStyle} onClick={() => this.setState({ branchTableToggled: false })}>-</button> : <button onClick={() => this.setState({ branchTableToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {branchTableToggled && this.state.branchData.map((tableData => <Table tablename={"branchName"} data={tableData} />))}

                        {domainData.length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>Domain Table</h4>
                                {domainTableToggled ? <button style={toggleStyle} onClick={() => this.setState({ domainTableToggled: false })}>-</button> : <button onClick={() => this.setState({ domainTableToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {domainTableToggled && this.state.domainData.map((tableData => <Table tablename={"domainName"} data={tableData} />))}

                        {webhookData.length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>Webhook Table</h4>
                                {webhookTableToggled ? <button style={toggleStyle} onClick={() => this.setState({ webhookTableToggled: false })}>-</button> : <button onClick={() => this.setState({ webhookTableToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {webhookTableToggled && this.state.webhookData.map((tableData => <Table tablename={"webhookId"} data={tableData} />))}

                        {Object.keys(lambdaData).length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>LambdaEdgeConfig Table</h4>
                                {LambdaEdgeToggled ? <button style={toggleStyle} onClick={() => this.setState({ LambdaEdgeToggled: false })}>-</button> : <button onClick={() => this.setState({ LambdaEdgeToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {LambdaEdgeToggled && <Table data={this.state.lambdaData} />}

                        {jobData.length ? (
                            <div style={flexStyle}>
                                <h4 style={{ marginBottom: 0 }}>Job Table</h4>
                                <input type="text" name="jobSearch" value={jobSearch} onChange={this.handleJobSearch} placeholder="Job Table Search..." />
                                {jobTableToggled ? <button style={toggleStyle} onClick={() => this.setState({ jobTableToggled: false })}>-</button> : <button onClick={() => this.setState({ jobTableToggled: true })} style={toggleStyle}>+</button>}
                            </div>
                        ) : null}
                        {jobTableToggled && this.state.jobData.map((tableData => <Table id="jobTable" tablename={"jobId"} data={tableData} />))}

                        <h5>Number of Jobs Running: <span style={{ color: "#0d6efd" }}>{numOfJobs}</span></h5>
                    </>
                )}
            </div>
        )
    }
}


export default CustomerInformation;