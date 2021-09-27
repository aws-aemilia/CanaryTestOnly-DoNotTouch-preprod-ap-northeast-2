import React, { Component } from "react";
import { Button, Alert } from "react-bootstrap";
import InsightsToolSelector from "../../components/insightsToolSelector";
import Ajax from "../../ajax";
import DateTimePicker from "react-datetime-picker";
import Spinner from "react-bootstrap/Spinner";
import BootstrapTable from "react-bootstrap-table-next";
import paginationFactory from "react-bootstrap-table2-paginator";
import "./insights.css"
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
    }

    componentDidMount() {
        this.getRegions();
    }

    getRegions = async () => {
        const { data: regions } = await Ajax().fetch("/regions");
        this.setState({ regions });
    };

    getAccountId = async () => {
        this.setState({ accounts: [], timeout: false, loading: true });

        if (
            this.state.time != null &&
            this.state.timeRange !== "S" &&
            this.state.timeRange !== "m"
        ) {
            const selectedTime = this.state.time;
            const timeWithoutSecondMinute = new Date(selectedTime.setMinutes(0, 0, 0));
            this.setState({ time: timeWithoutSecondMinute });
        }

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
            const { data: accounts } = await Ajax().post("/insights/accountInfo", params);
            // Change region display format
            accounts.forEach((element) => {
                element.regions = element.regions.join(", ");
            });
            this.setState({ loading: false, accounts });
        } catch (error) {
            this.setState({ timeout: true, loading: false, error });
        }
    };

    clearCache = async () => {
        this.setState({ accounts: [], timeout: false, loading: true });

        if (
            this.state.time != null &&
            this.state.timeRange !== "S" &&
            this.state.timeRange !== "m"
        ) {
            const selectedTime = this.state.time;
            const timeWithoutSecondMinute = new Date(selectedTime.setMinutes(0, 0, 0));
            this.setState({ time: timeWithoutSecondMinute });
        }

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

        try {
            await Ajax().post("/insights/clear", params);
            this.setState({ loading: false })
        } catch (error) {
            this.setState({ loading: false, error });
        }
    };

    handleTimeRangeChange = async (timeRange) => {
        const now = new Date();
        this.setState({ time: now, timeRange });
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
                    animation="border"
                    aria-hidden="true"
                    as="span"
                    role="status"
                    size="lg"
                />
            );
        }
    }

    render() {
        const formatter = (cell) => {
            let SOTLink =
                "https://edge-tools.amazon.com/search?query=" +
                cell;
            return <a href={SOTLink} target="_blank" rel="noopener noreferrer"> {cell} </a>;
        };

        const columns = [
            {
                formatter: formatter,
                dataField: "accountId",
                text: "Account Id",
                headerStyle: () => {
                    return { width: "10%" };
                },
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
                row.appId.forEach((appId) => {
                    items.push(<li key={appId}>{`${appId}`}</li>);
                })

                return (
                    <div className="expandRow">
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
                <InsightsToolSelector
                    loading={this.state.loading}
                    regions={this.state.regions}
                    region={this.state.region}
                    stage={this.state.stage}
                    timeRange={this.state.timeRange}
                    onErrorCodeChange={(errorCode) =>
                        errorCode.length > 0 ? this.setState({ eventType: "E-" + errorCode }) : this.setState({ eventType: "" })
                    }
                    onRegionChange={(region) => this.setState({ region })}
                    onStageChange={(stage) =>
                        this.setState({ stage, region: "" })
                    }
                    onTimeRangeChange={(timeRange) =>
                        this.handleTimeRangeChange(timeRange)
                    }
                    onPatternChange={(pattern) => {
                        pattern = pattern.toLowerCase();
                        pattern.length > 0 ? this.setState({ eventType: "P-" + pattern }) : this.setState({ eventType: "" })
                    }}
                >
                    {this.state.timePickerFormat && (
                        <div>
                            <div className="input-group date">
                                <DateTimePicker
                                    disableClock={true}
                                    disableCalendar={true}
                                    format={this.state.timePickerFormat}
                                    onChange={(time) =>
                                        this.setState({ time })
                                    }
                                    value={this.state.time}
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
                                        disabled={
                                            !this.state.stage ||
                                            !this.state.region ||
                                            this.state.loading
                                        }
                                        onClick={this.getAccountId}
                                        variant="info"
                                    >
                                        Get Data
                                    </Button>
                                )}

                                {this.state.loading && (
                                    <Button disabled variant="info">
                                        <Spinner
                                            animation="border"
                                            aria-hidden="true"
                                            as="span"
                                            role="status"
                                            size="sm"
                                        />
                                    </Button>
                                )}
                            </div>
                        )}

                    {this.state.region &&
                        this.state.eventType &&
                        this.state.timeRange && (
                            <div>
                                {!this.state.loading && (
                                    <Button
                                        disabled={
                                            !this.state.stage ||
                                            !this.state.region ||
                                            this.state.loading
                                        }
                                        onClick={this.clearCache}
                                        variant="info"
                                    >
                                        Clear Cache
                                    </Button>
                                )}

                                {this.state.loading && (
                                    <Button disabled variant="info">
                                        <Spinner
                                            animation="border"
                                            aria-hidden="true"
                                            as="span"
                                            role="status"
                                            size="sm"
                                        />
                                    </Button>
                                )}
                            </div>
                        )}
                </InsightsToolSelector>
                {this.state.timeout && (
                    <Alert variant={"danger"}>
                        Slow query! Query is running in the background. Please try again later to retrieve results
                    </Alert>
                )}
                <div className="result-table">
                    <h4>
                        Total:&nbsp;
                        {!this.state.loading && (
                            <span className="badge badge-danger">
                                {Object.keys(this.state.accounts).length}
                            </span>
                        )}
                        {this.state.loading && (
                            <Spinner
                                animation="border"
                                aria-hidden="false"
                                as="span"
                                role="status"
                                size="sm"
                            />
                        )}
                        &nbsp;impacted accounts
                    </h4>
                    <div>
                        <BootstrapTable
                            bootstrap4
                            columns={columns}
                            condensed
                            data={this.state.accounts}
                            defaultSorted={defaultSorted}
                            expandRow={expandRow}
                            hover
                            keyField="accountId"
                            loading={true}
                            noDataIndication={this._setTableOption()}
                            pagination={paginationFactory(paginationOption)}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

export default Insights;
