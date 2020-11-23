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

                            let config = {};

                            if(key === "config"){
                                config = data[key];
                                console.log("config", config)
                            }
                            
                            let infoArray = [];

                            if(key === "subDomainDOs" || key === "jobSteps") {
                                infoArray = data[key];
                                console.log("infoArray", infoArray)
                            }


                            return (
                                <tr key={index}>
                                    <td>{key}</td>
                                    <td>
                            {
                            data[key] === 0 ? "False" 
                            : data[key] === 1 ? "True" 
                            : key === "createTime" ? `${dateRetrieved}` 
                            : key === "updateTime" ? `${dateRetrieved}` 
                            : key === "commitTime" ? `${dateRetrieved}` 
                            : key === "endTime" ? `${dateRetrieved}` 
                            : key === "startTime" ? `${dateRetrieved}` 
                            : key === "config" ? (Object.keys(config).map((configKey, configIndex) => (<div key={configIndex} className={styles.config}><h6>{configKey}</h6><p>{typeof config[configKey] === 'object' && Object.keys(config[configKey]).length === 0 ? "" : config[configKey]}</p></div>)))
                            : typeof data[key] === 'object' && Object.keys(data[key]).length === 0 ? ""
                            : key === "subDomainDOs" || key === "jobSteps" ? infoArray.forEach(element => {
                                for (const [aKey, value] of Object.entries(element)) {
                                    (Object.keys(value).map((Key, Index) => (<div key={Index} className={styles.config}><h6>{Key}</h6><p>{typeof infoArray[Key] === 'object' && Object.keys(infoArray[Key]).length === 0 ? "" : infoArray[Key]}</p></div>)))
                                    
                                }   
                            })
                            : JSON.stringify(data[key])
                            }
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