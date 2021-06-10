
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';


class Page extends React.Component {

  render() {
    return (
      <div className="w-screen h-screen bg-red-500">
        <canvas></canvas>
      </div>
    )
  }

  componentDidMount() {
    alert('test');
  }

}


ReactDOM.render(<Page />, document.getElementById('root'));
