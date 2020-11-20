import React, { Component } from 'react';
import styles from './table.module.css';
import AceEditor from 'react-ace';

class Table extends Component {
    constructor(props) {
        super(props);
        this.state = {
            data: props.data
        }
    }

    render() {
        const { data } = this.props;
        return (
            <table className={styles.table}>
                <tbody>
                    <tr>
                        <th>Property</th>
                        <th>Value</th>
                    </tr>
                    {
                        Object.keys(this.props.data).length ? Object.keys(this.props.data).sort().map((key, index) => {
                            let getDate = "";
                            if (key === "createTime" || key === "updateTime" || key === "commitTime" || key === "endTime" || key === "startTime") {
                                getDate = JSON.parse(JSON.stringify(data[key]))
                            }

                            const dateRetrieved = new Date(`${getDate}`)

                            let config = {};

                            if(key === "config"){
                                config = data[key];
                                console.log("config", config)
                            }


                            return (
                                <tr key={index}>
                                    <td>{key}</td>
                                    <td>
                            {JSON.stringify(data[key]) === "0" ? "False" : JSON.stringify(data[key]) === "1" ? "True" : key === "createTime" ? `${dateRetrieved}` : key === "updateTime" ? `${dateRetrieved}` : key === "config" ? (Object.keys(config).map((configKey, configIndex) => (<div key={configIndex} className={styles.config}><h6>{configKey}</h6><p>{config[configKey]}</p></div>))) : JSON.stringify(data[key])}
                                    </td>
                                </tr>
                            )
                        }) : <tr>
                                <td>No Data Found</td>
                                <td></td>
                            </tr>
                    }
                </tbody>
            </table>
        )
    }
}
// test
export default Table;