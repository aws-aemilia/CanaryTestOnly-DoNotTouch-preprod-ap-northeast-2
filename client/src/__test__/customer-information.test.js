import Enzyme from "enzyme";
import Adapter from "enzyme-adapter-react-16";
import React from "react";
import StageRegionSelector from "../../components/stageRegionSelector";
import CustomerInformation from "../pages/oncallTools/customer-Information";

Enzyme.configure({ adapter: new Adapter() });

describe("StageRegionSelector render correctly", () => {
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

    let wrapper = Enzyme.shallow(<StageRegionSelector regions={regions} />);
    it("StageRegionSelector render without crashing", () => {
        expect(wrapper).toMatchSnapshot();
    });
});

describe("CustomerInformation render correctly", () => {

    let wrapper = Enzyme.shallow(<CustomerInformation />);
    wrapper.setState({
        stage: "beta",
        region: "us-west-2",
        search: "dpbfdvz28vziz"
    });

    it("State change correctly", () => {
        expect(wrapper.state().stage).toEqual("beta");
        expect(wrapper.state().region).toEqual("us-west-2");
        expect(wrapper.state().search).toEqual("dpbfdvz28vziz");
    })

});
