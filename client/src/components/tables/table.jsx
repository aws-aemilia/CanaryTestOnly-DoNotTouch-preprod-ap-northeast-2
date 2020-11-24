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
                                getDate = data[key]
                            }

                            const dateRetrieved = new Date(`${getDate}`)



                            return (
                                <tr key={index}>
                                    <td>{key}</td>
                                    <td>
                                        <pre><code>
                            {
                            data[key] === 0 ? "False" 
                            : data[key] === 1 ? "True" 
                            : key === "createTime" ? `${dateRetrieved}` 
                            : key === "updateTime" ? `${dateRetrieved}` 
                            : key === "commitTime" ? `${dateRetrieved}` 
                            : key === "endTime" ? `${dateRetrieved}` 
                            : key === "startTime" ? `${dateRetrieved}`
                            : typeof data[key] === 'object' && Object.keys(data[key]).length === 0 ? ""
                            : JSON.stringify(data[key], undefined, 2).replace(/"/g, "").replace(/\\n/g, "\n")
                            }
                                        </code></pre>
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