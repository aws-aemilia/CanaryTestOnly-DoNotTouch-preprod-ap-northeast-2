import * as React from 'react';
import {ButtonToolbar, DropdownButton, Dropdown} from "react-bootstrap";

const regionMapByAirport = {
    iad: {
        selector: 'Northern Virginia',
        region: 'us-east-1'
    },
    sfo: {
        selector: 'Northern California',
        region: 'us-west-1'
    },
    pdx: {
        selector: 'Oregon',
        region: 'us-west-2'
    },
    cmh: {
        selector: 'Columbus, Ohio',
        region: 'us-east-2'
    },
    yul: {
        selector: 'Montreal Quebec Canada',
        region: 'ca-central-1'
    },
    bom: {
        selector: 'Mumbai, India',
        region: 'ap-south-1'
    },
    icn: {
        selector: 'Seoul, South Korea',
        region: 'ap-northeast-2'
    },
    sin: {
        selector: 'Singapore',
        region: 'ap-southeast-1'
    },
    syd: {
        selector: 'Sydney, Austrailia',
        region: 'ap-southeast-2'
    },
    nrt: {
        selector: 'Tokyo, Japan',
        region: 'ap-northeast-1'
    },
    fra: {
        selector: 'Frankfurt, Germany',
        region: 'eu-central-1'
    },
    dub: {
        selector: 'Dublin, Ireland',
        region: 'eu-west-1'
    },
    lhr: {
        selector: 'London, England',
        region: 'eu-west-2',
    },
    gru: {
        selector: 'Sao Paulo, Brazil',
        region: 'sa-east-1'
    },
    bjs: {
        selector: 'Beijing, China',
        region: 'cn-north-1'
    },
    zhy: {
        selector: 'Zhongwei, Ningxia, China',
        region: 'cn-northwest-1'
    },
    pdt: {
        selector: 'GovCloud',
        region: 'govcloud'
    },
    arn: {
        selector: 'Sweden',
        region: 'eu-north-1'
    },
    hkg: {
        selector: 'Hong Kong',
        region: 'ap-east-1'
    },
    cdg: {
        selector: 'Paris, France',
        region: 'eu-west-3'
    },
    kix: {
        selector: 'Japan',
        region: 'ap-northeast-3'
    }
};
const regionMapByRegion = {};

Object.keys(regionMapByAirport).forEach((airport) => regionMapByRegion[regionMapByAirport[airport].region] = airport);

class StageRegionSelector extends React.Component {
    render() {
        const regions = this.props.regions;
        const stage = this.props.stage;
        const region = this.props.region;
        const loading = this.props.loading;
        const onStageChange = this.props.onStageChange;
        const onRegionChange = this.props.onRegionChange;
        return (
            <div>
                <ButtonToolbar style={{margin: '1rem'}} className="metering-button-toolbar">
                    <DropdownButton
                        title={'Stage' + (stage ? ' - ' + stage : '')}
                        disabled={loading}
                        variant={'primary'}
                        id={'dropdown-variants-primary'}
                        key={'stage'}
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
                        title={'Region' + (region ? ' - ' + region : '')}
                        variant={'secondary'}
                        disabled={!stage || loading}
                        id={'dropdown-variants-primary'}
                        key={'region'}
                    >
                        {(!stage ? [] : regions[stage]).map((region, index) => (
                            <Dropdown.Item
                                key={region}
                                eventKey={index}
                                onSelect={() => onRegionChange(region)}
                            >
                                {region} ({regionMapByRegion[region].toUpperCase()})
                            </Dropdown.Item>
                        ))}
                    </DropdownButton>
                    {this.props.children}
                </ButtonToolbar>
            </div>
        );
    }
}

export default StageRegionSelector;
