import React, { Component } from 'react';
import styles from './table.module.css';

class AppTable extends Component {

    constructor(props) {
        super(props);
        this.state = {
            data: props.data
        }
    }


    render() {
        return (
            <table className={styles.table}>
                <tbody>
                    <tr>
                        <th>Property</th>
                        <th>Value</th>
                    </tr>
                    {
                        Object.keys(this.props.data).length ? Object.keys(this.props.data).map((key, index) => (
                            <tr key={index}>
                                <td>{key.appId}</td>
                                <td>{JSON.stringify(this.props.data[key.appId])}</td>                            </tr>
                        )) : <tr>
                                <td>No Data Found</td>
                                <td></td>
                            </tr>
                    }
                </tbody>
            </table>
        )
    }
}

export default AppTable;
