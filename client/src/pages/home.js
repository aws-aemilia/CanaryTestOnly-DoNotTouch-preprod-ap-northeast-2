import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';


class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {customerId: ''};

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleChange(event) {
    this.setState({customerId: event.target.value});
  }

  handleSubmit(event) {
    window.location.href = `/failures/${this.state.customerId}`;
    event.preventDefault();
  }

  render() {
    return (
    <div className="App" style={{'horizontal-align': 'center'}}>
      <h1>Amplify Console Build Analytics</h1>
      {/* Link to List.js */}
      <Link to={'./failures'}>
        <Button variant="primary" type="submit">
            Top Failures by Account ID
        </Button>
      </Link>
      <br/>
      <div style={{width: 400, display: 'inline-block', 'padding-top': 100}}>
        <Form onSubmit={this.handleSubmit}>
          <Form.Group controlId="formBasicEmail">
            <Form.Label>Customer Account ID</Form.Label>
            <Form.Control placeholder="Enter Account ID" onChange={this.handleChange} />
          </Form.Group>
          <Button variant="primary" type="submit">
            Submit
          </Button>
        </Form>
      </div>
    </div>
    );
  }
}
export default Home;

