import * as React from 'react';
import {ButtonToolbar, DropdownButton, Dropdown} from "react-bootstrap";

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
                                {region}
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
