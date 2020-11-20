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
                            let getDateParse = "";
                            if(key === "createTime" || key === "updateTime"){
                                getDate = `${JSON.stringify(data[key])}`;
                                console.log("date returned", getDate);

                                let testing = new Date(`${getDate}`)

                            console.log("date testing", testing)
                            

                                getDateParse = JSON.parse(JSON.stringify(data[key]))

                                console.log("date returned parsed>>>", `${getDateParse}`);
                                console.log("date returned parsed", getDateParse);
                                let dateRetrievedParse = new Date(`${getDateParse}`)
                                console.log("date retrieved parse", dateRetrievedParse)
                            }

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
// test
export default Table;