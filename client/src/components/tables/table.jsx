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
                            if(key === "createTime" || key === "updateTime"){
                                getDate = `${JSON.stringify(data[key])}`;
                            }

                            console.log("date returned", getDate);
                            console.log("typeof var", typeof getDate)
                            console.log("typeof var2", typeof `${getDate}`)
                            let dateRetrieved = new Date(`${getDate}`)
                            console.log("date retrieved", dateRetrieved)
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

export default Table;
