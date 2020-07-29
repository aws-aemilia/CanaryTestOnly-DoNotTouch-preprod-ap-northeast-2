import * as React from "react";
import { ButtonToolbar, DropdownButton, Dropdown, Form } from "react-bootstrap";
import "./insightsToolSelector.css"
const regionMapByAirport = require('./regionMapByAirport.json');
const regionMapByRegion = {};

const errorCodeContent = {
    "5XX": "5XX - Server errors",
    "500": "500 - Internal server error",
    "502": "502 - Bad gateway",
    "503": "503 - Service unavailable",
    "504": "504 - Gateway timeout",
};

const timeRangeContent = {
    S: "Second",
    m: "Minute",
    H: "Hour",
    D: "Day",
    M: "Month",
};

Object.keys(regionMapByAirport).forEach(
    (airport) =>
        (regionMapByRegion[regionMapByAirport[airport].region] = airport)
);

class InsightsToolSelector extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            customErrorCode: false,
            errorCode: "",
            queryType: "",
        };
    }
    render() {
        const {
            stage,
            region,
            regions,
            loading,
            timeRange,
            onStageChange,
            onRegionChange,
            onErrorCodeChange,
            onPatternChange,
            onTimeRangeChange,
        } = this.props;

        return (
            <ButtonToolbar
                className="metering-button-toolbar"
            >
                <DropdownButton
                    disabled={loading}
                    id={"Stage"}
                    key={"stage"}
                    title={"Stage" + (stage ? " - " + stage : "")}
                    variant={"primary"}
                >
                    {Object.keys(regions).map((stage, index) => (
                        <Dropdown.Item
                            eventKey={index}
                            key={stage}
                            onSelect={() => onStageChange(stage)}
                        >
                            {stage}
                        </Dropdown.Item>
                    ))}
                </DropdownButton>

                <DropdownButton
                    disabled={!stage || loading}
                    id={"Region"}
                    key={"region"}
                    title={"Region" + (region ? " - " + region : "")}
                    variant={"secondary"}
                >
                    <Dropdown.Item
                        key={"all"}
                        onSelect={() => onRegionChange("global")}
                    >
                        All Regions
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    {(!stage ? [] : regions[stage]).map((region, index) => (
                        <Dropdown.Item
                            eventKey={index}
                            key={region}
                            onSelect={() => onRegionChange(region)}
                        >
                            {region}({regionMapByRegion[region].toUpperCase()})
                        </Dropdown.Item>
                    ))}
                </DropdownButton>

                <DropdownButton
                    disabled={loading}
                    title={
                        this.state.queryType
                            ? "Query Type - " + this.state.queryType
                            : "Select Query Type"
                    }
                    variant={"primary"}
                >
                    <Dropdown.Item
                        key={"Pattern"}
                        onSelect={() =>
                            this.setState({ queryType: "Pattern" })
                        }
                    >
                        Pattern
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                        key={"ErrorCode"}
                        onSelect={() =>
                            this.setState({ queryType: "Error Code" })
                        }
                    >
                        Error Code
                    </Dropdown.Item>
                </DropdownButton>

                {this.state.queryType === "Error Code" && (
                    <DropdownButton
                        disabled={loading}
                        id={"ErrorCode"}
                        key={"errorCode"}
                        title={
                            this.state.customErrorCode
                                ? "Custom Error Code"
                                : errorCodeContent[this.state.errorCode]
                                ? errorCodeContent[this.state.errorCode]
                                : "Error Code"
                        }
                        variant={"danger"}
                    >
                        <Dropdown.Item
                            key={"custom"}
                            onSelect={() =>
                                this.setState({ customErrorCode: true })
                            }
                        >
                            Custom Error Code
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        {Object.keys(errorCodeContent).map(
                            (code, index) => (
                                <Dropdown.Item
                                    eventKey={index}
                                    key={code}
                                    onSelect={() => {
                                        this.setState({
                                            customErrorCode: false,
                                            errorCode: code,
                                        });
                                        return onErrorCodeChange(code);
                                    }}
                                >
                                    {errorCodeContent[code]}
                                </Dropdown.Item>
                            )
                        )}
                    </DropdownButton>
                )}

                {this.state.queryType === "Pattern" && (
                    <Form className = "Form">
                        <Form.Control
                            onChange={(event) =>
                                onPatternChange(event.target.value)
                            }
                            placeholder="Custom pattern"
                            type="text"
                        />
                    </Form>
                )}

                {this.state.customErrorCode &&
                    this.state.queryType === "Error Code" && (
                        <Form className = "Form">
                            <Form.Control
                                onChange={(event) =>
                                    onErrorCodeChange(event.target.value)
                                }
                                placeholder="Error Code"
                                type="text"
                            />
                        </Form>
                    )}

                <DropdownButton
                    disabled={loading}
                    id={"TimeRange"}
                    key={"timeRange"}
                    title={
                        "Time Range" +
                        (timeRangeContent[timeRange]
                            ? " - " + timeRangeContent[timeRange]
                            : "")
                    }
                    variant={"warning"}
                >
                    {Object.keys(timeRangeContent).map((range, index) => (
                        <Dropdown.Item
                            eventKey={index}
                            key={range}
                            onSelect={() => onTimeRangeChange(range)}
                        >
                            {timeRangeContent[range]}
                        </Dropdown.Item>
                    ))}
                </DropdownButton>

                {this.props.children}
            </ButtonToolbar>
        );
    }
}

export default InsightsToolSelector;
