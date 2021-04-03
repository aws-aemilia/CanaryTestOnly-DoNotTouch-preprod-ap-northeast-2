import React,{Component} from 'react';

class Search extends Component{
    searchStyle = {
        border: '1px solid #ddd',
        padding: '5px',
        width: '200px',
        borderRadius: '5px',
        fontSize: '12px',
        outline:'none',
        marginRight:'15px'
    }

    constructor(props){
        super(props);
        this.state = {
            searchValue:''
        }
    }

    handleSearchChange = (event) =>{
        this.setState({ searchValue:event.target.value });
        // this.props.searchDataChanged(event.target.value);
    }

    render(){
        return(
            <div style={{ display:'flex' }}>
                <input type="search" placeholder="Search by App ID..." style={this.searchStyle} value={this.state.searchValue} onChange={this.handleSearchChange}/>
                <button style={{
                    'border': 'none',
                    'backgroundColor': '#ddd',
                    'padding': '8px',
                    'borderRadius': '5px'
                }}
                onClick={ () => this.props.searchDataChanged(this.state.searchValue)}
                >
                    Search App information
                </button>
            </div>
        )
    }
}

export default Search;
