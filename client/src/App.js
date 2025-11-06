import React from 'react';
import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import OtherPage from './OtherPage';
import Fib from './Fib';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Fibonacci Calculator</h1>
          <nav style={{ marginTop: '20px' }}>
            <Link to="/" style={{ marginRight: '15px', color: '#61dafb' }}>Home</Link>
            <Link to="/otherpage" style={{ color: '#61dafb' }}>Other Page</Link>
          </nav>
        </header>
        <div style={{ padding: '20px' }}>
          <Routes>
            <Route path="/" element={<Fib />} />
            <Route path="/otherpage" element={<OtherPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
