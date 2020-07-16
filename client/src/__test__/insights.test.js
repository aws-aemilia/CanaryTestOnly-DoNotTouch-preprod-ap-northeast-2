import Enzyme from "enzyme";
import Adapter from "enzyme-adapter-react-16";
import React from "react";
import { Button } from "react-bootstrap";
import InsightsToolSelector from "../components/insightsToolSelector";
import Insights from "../pages/insights";

Enzyme.configure({ adapter: new Adapter() });

describe("insightsToolSelector render correctly", () => {
    const regions = {
        beta: ["us-west-2"],
        gamma: ["us-west-2", "us-east-1"],
        prod: [
            "us-west-2",
            "us-east-1",
            "us-east-2",
            "eu-west-1",
            "ap-southeast-2",
            "eu-west-2",
            "ap-northeast-1",
            "ap-southeast-1",
            "ap-northeast-2",
            "ap-south-1",
            "eu-central-1",
        ],
    };

    let wrapper = Enzyme.shallow(<InsightsToolSelector regions={regions} />);
    it("InsightsToolSelector render without crashing", () => {
        expect(wrapper).toMatchSnapshot();
    });
});

describe("Insights render correctly", () => {

    let wrapper = Enzyme.shallow(<Insights />);
    wrapper.setState({
        stage: "prod",
        region: "us-east-2",
        eventType: "E-5XX",
        timeRange: "M",
        loading: false,
    });

    it("State change correctly", () =>{
        expect(wrapper.state().stage).toEqual("prod");
        expect(wrapper.state().region).toEqual("us-east-2");
        expect(wrapper.state().loading).toEqual(false);
    })
    
    it("Click Button called getAccountId", () => {
        const spy = jest.spyOn(wrapper.instance(), "getAccountId");
        wrapper.instance().forceUpdate();
        wrapper.find(Button).simulate("click");
        expect(spy).toHaveBeenCalled();
    });

});
