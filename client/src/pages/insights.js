import React, { Component } from "react";
import { Button, Alert } from "react-bootstrap";
import InsightsToolSelector from "../components/insightsToolSelector";
import NavBar from "../components/navbar";
import Ajax from "../ajax";
import DateTimePicker from "react-datetime-picker";
import Spinner from "react-bootstrap/Spinner";
import BootstrapTable from "react-bootstrap-table-next";
import paginationFactory from "react-bootstrap-table2-paginator";
import "react-bootstrap-table-next/dist/react-bootstrap-table2.min.css";
import "react-bootstrap-table2-paginator/dist/react-bootstrap-table2-paginator.min.css";

class Insights extends Component {
    constructor(props) {
        super(props);
        const now = new Date();
        this.state = {
            regions: {},
            accounts: [],
            stage: "",
            region: "",
            time: now,
            eventType: "",
            timeRange: "",
            timePickerFormat: "",
            loading: false,
            timeout: false,
        };
        this.getRegions();
    }

    getRegions = async () => {
        // To change to Ajax.fetch module
        const { data: regions } = await Ajax().fetch("/regions");
        this.setState({ regions });
    };

    getAccountId = async () => {
        this.setState({ accounts: [] });
        this.setState({ loading: true });
        this.setState({ timeout: false });
        
        if (
            this.state.time != null &&
            this.state.timeRange !== "S" &&
            this.state.timeRange !== "m"
        )
            this.state.time.setMinutes(0, 0, 0);

        const UTCtime =
            this.state.time.getTime() / 1000 -
            this.state.time.getTimezoneOffset() * 60;

        // Define the query parameter
        const params = {
            stage: this.state.stage,
            region: this.state.region,
            time: UTCtime,
            timeRange: this.state.timeRange,
            eventType: this.state.eventType,
        };

        // Call API to fetch account ID data
        try {
            const { data: accounts } = await Ajax().post("/insights", params);
            // Change region display format
            accounts.forEach((element) => {
                element.regions = element.regions.join(", ");
            });
            this.setState({ loading: false, accounts });
        } catch (error) {
            this.setState({ timeout: true });
            this.setState({ loading: false });
            this.setState({ error });
        }
    };

    handleTimeRangeChange = async (timeRange) => {
        const now = new Date();
        this.setState({ time: now });
        this.setState({ timeRange });
        if (timeRange === "H") {
            this.setState({ timePickerFormat: "MMM/dd/y hh a" });
        } else if (timeRange === "D") {
            this.setState({ timePickerFormat: "MMM/dd/y" });
        } else if (timeRange === "M") {
            this.setState({ timePickerFormat: "MMM/y" });
        } else if (timeRange === "m") {
            this.setState({ timePickerFormat: "MMM/dd/y hh:mm a" });
        } else if (timeRange === "S") {
            this.setState({ timePickerFormat: "MMM/dd/y hh:mm:ss a" });
        }
    };

    _setTableOption() {
        if (!this.state.loading) {
            return "No data to show";
        } else {
            return (
                <Spinner
                    as="span"
                    animation="border"
                    size="lg"
                    role="status"
                    aria-hidden="true"
                />
            );
        }
    }

    render() {
        const formatter = (cell) => {
            let SOTLink =
                "https://aws-tools.amazon.com/servicetools/search.aws?searchType=ACCOUNT&query=" +
                cell;
            return <a href={SOTLink} target="_blank" rel = "noopener noreferrer"> {cell} </a>;
        };

        const columns = [
            {
                dataField: "accountId",
                text: "Account Id",
                headerStyle: () => {
                    return { width: "10%" };
                },
                formatter: formatter,
            },
            {
                dataField: "appId.length",
                text: "Number of Apps",
                sort: true,
                headerStyle: () => {
                    return { width: "10%" };
                },
            },
            {
                dataField: "regions",
                text: "Regions",
                sort: true,
            },
        ];

        const expandRow = {
            renderer: (row) => {
                const items = [];
                for (let i = 0; i < row.appId.length; i++) {
                    items.push(<li key={i}>{`${row.appId[i]} `}</li>);
                }
                return (
                    <div style={{ overflow: "scroll", height: "auto", maxHeight: '300px' }}>
                        <span className="badge badge-primary">App IDs: </span>
                        <ul>{items}</ul>
                    </div>
                );
            },
            onlyOneExpanding: true,
        };

        const defaultSorted = [
            {
                dataField: "appId.length",
                order: "desc",
            },
            {
                dataField: "accountId.length",
                order: "desc",
            },
        ];

        const paginationOption = {
            sizePerPageList: [
                {
                    text: "50",
                    value: 50,
                },
                {
                    text: "100",
                    value: 100,
                },
                {
                    text: "200",
                    value: 200,
                },
            ],
            sizePerPage: 50,
        };
        return (
            <div>
                <NavBar />
                <div>
                    <InsightsToolSelector
                        regions={this.state.regions}
                        stage={this.state.stage}
                        region={this.state.region}
                        loading={this.state.loading}
                        timeRange={this.state.timeRange}
                        onStageChange={(stage) =>
                            this.setState({ stage, region: "" })
                        }
                        onRegionChange={(region) => this.setState({ region })}
                        onErrorCodeChange={(errorCode) =>
                            errorCode.length > 0 ? this.setState({ eventType : "E-" + errorCode }) : this.setState({ eventType : ""})
                        }
                        onPatternChange={(pattern) =>
                            pattern.length > 0 ?  this.setState({ eventType : "P-" + pattern }) : this.setState({ eventType : ""})
                        }
                        onTimeRangeChange={(timeRange) =>
                            this.handleTimeRangeChange(timeRange)
                        }
                    >
                        {this.state.timePickerFormat && (
                            <div>
                                <div className="input-group date">
                                    <DateTimePicker
                                        onChange={(time) =>
                                            this.setState({ time })
                                        }
                                        // inline
                                        format={this.state.timePickerFormat}
                                        value={this.state.time}
                                        disableClock={true}
                                        disableCalendar={true}
                                    />
                                </div>
                                <span className="badge badge-pill badge-primary">
                                    Select time:
                                </span>
                            </div>
                        )}

                        {this.state.region &&
                            this.state.eventType &&
                            this.state.timeRange && (
                                <div>
                                    {!this.state.loading && (
                                        <Button
                                            variant="info"
                                            disabled={
                                                !this.state.stage ||
                                                !this.state.region ||
                                                this.state.loading
                                            }
                                            onClick={this.getAccountId}
                                        >
                                            Get Data
                                        </Button>
                                    )}

                                    {this.state.loading && (
                                        <Button variant="info" disabled>
                                            <Spinner
                                                as="span"
                                                animation="border"
                                                size="sm"
                                                role="status"
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    )}
                                </div>
                            )}
                    </InsightsToolSelector>
                </div>
                {this.state.timeout && (
                    <div>
                        <Alert variant={"danger"}>
                            Slow query! Query is running in the background. Please try again later to retrieve results 
                        </Alert>
                    </div>
                )}
                <div style={{ margin: "1rem" }}>
                    <h4>
                        Total:&nbsp;
                        {!this.state.loading && (
                            <span className="badge badge-danger">
                                {Object.keys(this.state.accounts).length}
                            </span>
                        )}
                        {this.state.loading && (
                            <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                role="status"
                                aria-hidden="false"
                            />
                        )}
                        &nbsp;impacted accounts
                    </h4>
                    <div>
                        <BootstrapTable
                            bootstrap4
                            keyField="accountId"
                            data={this.state.accounts}
                            loading={true}
                            expandRow={expandRow}
                            columns={columns}
                            noDataIndication={this._setTableOption()}
                            pagination={paginationFactory(paginationOption)}
                            defaultSorted={defaultSorted}
                            hover
                            condensed
                        />
                    </div>
                </div>
            </div>
        );
    }
}

export default Insights;
