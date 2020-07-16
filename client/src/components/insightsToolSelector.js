import * as React from "react";
import { ButtonToolbar, DropdownButton, Dropdown, Form } from "react-bootstrap";

const regionMapByAirport = {
    iad: {
        selector: "Northern Virginia",
        region: "us-east-1",
    },
    sfo: {
        selector: "Northern California",
        region: "us-west-1",
    },
    pdx: {
        selector: "Oregon",
        region: "us-west-2",
    },
    cmh: {
        selector: "Columbus, Ohio",
        region: "us-east-2",
    },
    yul: {
        selector: "Montreal Quebec Canada",
        region: "ca-central-1",
    },
    bom: {
        selector: "Mumbai, India",
        region: "ap-south-1",
    },
    icn: {
        selector: "Seoul, South Korea",
        region: "ap-northeast-2",
    },
    sin: {
        selector: "Singapore",
        region: "ap-southeast-1",
    },
    syd: {
        selector: "Sydney, Austrailia",
        region: "ap-southeast-2",
    },
    nrt: {
        selector: "Tokyo, Japan",
        region: "ap-northeast-1",
    },
    fra: {
        selector: "Frankfurt, Germany",
        region: "eu-central-1",
    },
    dub: {
        selector: "Dublin, Ireland",
        region: "eu-west-1",
    },
    lhr: {
        selector: "London, England",
        region: "eu-west-2",
    },
    gru: {
        selector: "Sao Paulo, Brazil",
        region: "sa-east-1",
    },
    bjs: {
        selector: "Beijing, China",
        region: "cn-north-1",
    },
    zhy: {
        selector: "Zhongwei, Ningxia, China",
        region: "cn-northwest-1",
    },
    pdt: {
        selector: "GovCloud",
        region: "govcloud",
    },
    arn: {
        selector: "Sweden",
        region: "eu-north-1",
    },
    hkg: {
        selector: "Hong Kong",
        region: "ap-east-1",
    },
    cdg: {
        selector: "Paris, France",
        region: "eu-west-3",
    },
    kix: {
        selector: "Japan",
        region: "ap-northeast-3",
    },
};
const regionMapByRegion = {};

const errorCodeContent = {
    "5XX": "5XX - Server errors",
    "4XX": "4XX - Client errors",
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
        const regions = this.props.regions;
        const stage = this.props.stage;
        const region = this.props.region;
        const loading = this.props.loading;
        const timeRange = this.props.timeRange;
        const onStageChange = this.props.onStageChange;
        const onRegionChange = this.props.onRegionChange;
        const onErrorCodeChange = this.props.onErrorCodeChange;
        const onPatternChange = this.props.onPatternChange;
        const onTimeRangeChange = this.props.onTimeRangeChange;
        return (
            <div>
                <ButtonToolbar
                    style={{ margin: "1rem" }}
                    className="metering-button-toolbar"
                >
                    <DropdownButton
                        title={"Stage" + (stage ? " - " + stage : "")}
                        disabled={loading}
                        variant={"primary"}
                        id={"Stage"}
                        key={"stage"}
                        data-testid={"Stage"}
                    >
                        {Object.keys(regions).map((stage, index) => (
                            <Dropdown.Item
                                key={stage}
                                eventKey={index}
                                onSelect={() => onStageChange(stage)}
                            >
                                {stage}
                            </Dropdown.Item>
                        ))}
                    </DropdownButton>

                    <DropdownButton
                        title={"Region" + (region ? " - " + region : "")}
                        variant={"secondary"}
                        disabled={!stage || loading}
                        id={"Region"}
                        test-id={"Region"}
                        key={"region"}
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
                                key={region}
                                eventKey={index}
                                onSelect={() => onRegionChange(region)}
                            >
                                {region} (
                                {regionMapByRegion[region].toUpperCase()})
                            </Dropdown.Item>
                        ))}
                    </DropdownButton>

                    <DropdownButton
                        title={
                            this.state.queryType
                                ? "Query Type - " + this.state.queryType
                                : "Select Query Type"
                        }
                        disabled={loading}
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
                            title={
                                this.state.customErrorCode
                                    ? "Custom Error Code"
                                    : errorCodeContent[this.state.errorCode]
                                    ? errorCodeContent[this.state.errorCode]
                                    : "Error Code"
                            }
                            disabled={loading}
                            variant={"danger"}
                            id={"ErrorCode"}
                            key={"errorCode"}
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
                                        key={code}
                                        eventKey={index}
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
                        <Form style={{ width: "150px" }}>
                            <Form.Control
                                size="md"
                                type="text"
                                placeholder="Custom pattern"
                                onChange={(event) =>
                                    onPatternChange(event.target.value)
                                }
                                width="5%"
                            />
                        </Form>
                    )}

                    {this.state.customErrorCode &&
                        this.state.queryType === "Error Code" && (
                            <Form style={{ width: "150px" }}>
                                <Form.Control
                                    size="md"
                                    type="text"
                                    placeholder="Error Code"
                                    onChange={(event) =>
                                        onErrorCodeChange(event.target.value)
                                    }
                                    width="5%"
                                />
                            </Form>
                        )}

                    <DropdownButton
                        title={
                            "Time Range" +
                            (timeRangeContent[timeRange]
                                ? " - " + timeRangeContent[timeRange]
                                : "")
                        }
                        disabled={loading}
                        variant={"warning"}
                        id={"TimeRange"}
                        key={"timeRange"}
                    >
                        {Object.keys(timeRangeContent).map((range, index) => (
                            <Dropdown.Item
                                key={range}
                                eventKey={index}
                                onSelect={() => onTimeRangeChange(range)}
                            >
                                {timeRangeContent[range]}
                            </Dropdown.Item>
                        ))}
                    </DropdownButton>

                    {this.props.children}
                </ButtonToolbar>
            </div>
        );
    }
}

export default InsightsToolSelector;
