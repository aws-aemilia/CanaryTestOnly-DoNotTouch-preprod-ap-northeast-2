import * as React from 'react';
import AceEditor from 'react-ace';
import 'brace/mode/json';
import {DropdownButton, Dropdown, Button, Form} from "react-bootstrap";
import * as CryptoJS from 'crypto-js';

const raw = "{\"bSeLkjtb68f3\":\"5d01c0148384\",\"Lhl39k5GVllR\":\"47ab83d06b69\",\"3N5Ur62ikulm\":\"7665c44b2e23\",\"Lgk+pckDc9in\":\"60b1bd6d87c2\",\"bcQHrnGrJBib\":\"de12f72c94e5\",\"/x3oEMvkBcu9\":\"eda9283f9479\",\"1Qft+Iw2QrDu\":\"d10d3b939795\",\"QUR3mNNIWIXY\":\"4f274c91062b\",\"85Lu7hS+cDjh\":\"e9cca122b1cf\",\"wSLckZBTqtPG\":\"265f131f0933\",\"rJNf7OXc99HH\":\"44b561bf2e28\",\"BlDEge/7zZgB\":\"ec1cce4394cf\",\"3A1ymMFBSFEl\":\"7550f5338558\",\"06h7pnHqoy8V\":\"6436b31397c3\",\"cd4atj9Tpisi\":\"238c9148d722\",\"KX+blVkS0Ynl\":\"1ee6338e34e1\",\"Wjm6gevZtcZn\":\"6bb4054fdcac\",\"zNo6MwJaVcC4\":\"3dad6bccb24a\",\"klWB27TYdEPf\":\"a842ce6ac3ba\",\"euF6eckK5ADJ\":\"673e30ab591d\",\"pr6aogmHeISv\":\"c347f52a0c5b\",\"Pex56kOggmQf\":\"cbd447548898\",\"qZxPOYKKikQ8\":\"dda41e80f4b3\",\"qEICiT/ezFzj\":\"cbde2a5a6a27\",\"5l+GQbe7lpZN\":\"3f44d233c132\",\"zbGS0QKoz0X6\":\"34ac432a5a26\",\"1cAXo5JmRshj\":\"4acd905989a9\",\"1Wo3a3+jw9o/\":\"7408f4c09be0\",\"zNXTmeigonCa\":\"efccfcdb1176\",\"6Zh+YTeoxtUf\":\"51af470111be\",\"/6W3FrWleDf3\":\"2f717775d17b\",\"NQng5HOV1L2G\":\"2c9c0691cec6\",\"hP0f26XtIAIe\":\"dbaafdc87bac\",\"MyvnMnguYsdp\":\"90dbea330377\",\"SGd/UnpXtmRx\":\"c158c372349d\",\"/P2+FQC+qYiy\":\"cc7ee6818d88\",\"VHE0qLrRluoT\":\"893705c5633d\",\"DrVHMEZYgFqt\":\"f88e54faf56b\",\"EfRvt4eGDNhu\":\"b30ebee0b52d\",\"7o43VZKPI0Ca\":\"ed9399996e2d\"}";
export default class extends React.Component {
    constructor() {
        super();
        const path = '/index.html';
        const {encodedPath, destination} = this.getResult(path, {});
        this.state = {
            fileConfig: '',
            path,
            encodedPath,
            destination,
            originKey: '',
            s3Path: undefined
        }
    }
    render() {
        return (
            <div>
                <AceEditor
                    theme="dracula"
                    name="ace_logs"
                    mode="json"
                    value={this.state.fileConfig}
                    minLines={2}
                    maxLines={10}
                    width={'100%'}
                    showPrintMargin={false}
                    editorProps={{
                        $blockScrolling: Infinity
                    }}
                    onChange={(fileConfig) => this.setState({fileConfig, destination: undefined})}
                />
                <Button
                    onClick={() => {
                        const fileConfig = JSON.parse(this.state.fileConfig.replace(/\\\"/g, '"'));
                        const {encodedPath, destination} = this.getResult(this.state.path, fileConfig);
                        this.setState({fileConfig: JSON.stringify(fileConfig, null, 4), encodedPath, destination})
                    }}
                >
                    Parse
                </Button>
                <Form.Group>
                    <Form.Label>Origin key</Form.Label>
                    <Form.Control
                        type="text"
                        // placeholder="/index.html"
                        onChange={this.onOriginKeyChange}
                        value={this.state.originKey}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label>Path</Form.Label>
                    <Form.Control
                        type="text"
                        placeholder="/index.html"
                        onChange={this.onPathChange}
                        value={this.state.path}
                    />
                </Form.Group>
                <div>Encoded path: <b>{this.state.encodedPath}</b></div>
                <div>Destination: <b>{this.state.destination ? this.state.destination : 'Not found'}</b></div>
                <div>S3 object name: <b>{this.state.s3Path ? this.state.s3Path : 'Not found'}</b></div>
            </div>
        )
    }
    getResult(path, config) {
        if (path.indexOf('/') === 0) {
            path = path.substr(1);
        }
        const encodedPath = this.encode(path, 12);

        const fileConfig = config ? config : this.state.fileConfig ? JSON.parse(this.state.fileConfig) : {};
        const destination = fileConfig[encodedPath];
        return {encodedPath, destination};
    }
    encrypt(data, secret) {
        const hash = CryptoJS.HmacSHA256(data, secret);
        const hashInBase64 = CryptoJS.enc.Base64.stringify(hash);
        return hashInBase64.replace(/[^A-Za-z0-9]/g, '');
    }
    encode(data, length) {
        const hash = CryptoJS.SHA256(data);
        const hashInBase64 = CryptoJS.enc.Base64.stringify(hash);
        return hashInBase64.slice(0, length);
    }
    onPathChange = (event) => {
        let path = event.target.value;
        const {encodedPath, destination} = this.getResult(path);
        const s3Path = this.state.originKey && destination ? this.encrypt(destination, this.state.originKey) : this.state.s3Path;
        this.setState({path: event.target.value, encodedPath, destination, s3Path});
    }
    onOriginKeyChange = (event) => {
        const originKey = event.target.value;
        const destination = this.state.destination;
        if (!destination) {
            return this.setState({originKey});
        }
        const s3Path = this.encrypt(destination, originKey);
        console.log(s3Path);
        this.setState({originKey, s3Path})
    }
}
