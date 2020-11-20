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
                            let getDate2 = "";
                            if (key === "createTime" || key === "updateTime") {
                                getDate = JSON.parse(JSON.stringify(data[key]))
                                getDate2 = data[key];
                                console.log("getDate2", getDate2)
                            }
                            const dateRetrieved = new Date(`${getDate}`)

                            let config = {}
                            let config2 = {}
                            if (key === "config") {
                                config = JSON.parse(JSON.stringify(data[key]))
                                config2 = JSON.parse(data[key])
                                console.log("config", config)
                                console.log("config", config2)
                            }


                            return (
                                <tr key={index}>
                                    <td>{key}</td>
                                    <td>
                                        {JSON.stringify(data[key]) === "0" ? "False" : JSON.stringify(data[key]) === "1" ? "True" : key === "createTime" ? `${dateRetrieved}` : key === "updateTime" ? `${dateRetrieved}` : JSON.stringify(data[key])}
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