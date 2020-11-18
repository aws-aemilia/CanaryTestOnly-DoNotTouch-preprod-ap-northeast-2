import React, { Component } from 'react';
import styles from './table.module.css';

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
                        Object.keys(this.props.data).length ? Object.keys(this.props.data).map((key, index) => {
                            if(JSON.stringify(data[key]) === "0"){
                                console.log("false quotes")
                            }else if(JSON.stringify(data[key]) === 0){
                                console.log("false")
                            }
                            return (
                                <tr key={index}>
                                    <td>{key}</td>
                                    <td>
                                        {JSON.stringify(data[key]) === "0" ? "False" : JSON.stringify(data[key]) == "1" ? "True" : JSON.stringify(data[key])}
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
