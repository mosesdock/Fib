import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Fib() {
  const [seenIndexes, setSeenIndexes] = useState([]);
  const [values, setValues] = useState({});
  const [index, setIndex] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchValues();
    fetchIndexes();
    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      fetchValues();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchValues = async () => {
    try {
      const response = await axios.get('/api/values/current');
      setValues(response.data || {});
    } catch (err) {
      console.error('Failed to fetch values:', err);
    }
  };

  const fetchIndexes = async () => {
    try {
      const response = await axios.get('/api/values/all');
      setSeenIndexes(response.data || []);
    } catch (err) {
      console.error('Failed to fetch indexes:', err);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!index || index.trim() === '') {
      setError('Please enter a number');
      return;
    }

    const parsedIndex = parseInt(index, 10);

    if (isNaN(parsedIndex)) {
      setError('Please enter a valid number');
      return;
    }

    if (parsedIndex < 0) {
      setError('Please enter a non-negative number');
      return;
    }

    if (parsedIndex > 40) {
      setError('Index must be 40 or less');
      return;
    }

    setLoading(true);

    try {
      await axios.post('/api/values', { index: parsedIndex });
      setIndex('');
      await fetchIndexes();
    } catch (err) {
      console.error('Failed to submit:', err);
      setError(err.response?.data?.error || 'Failed to calculate Fibonacci number');
    } finally {
      setLoading(false);
    }
  };

  const renderSeenIndexes = () => {
    if (!seenIndexes || seenIndexes.length === 0) {
      return <em>No calculations yet</em>;
    }
    return seenIndexes.map(({ number }) => number).join(', ');
  };

  const renderValues = () => {
    const entries = [];
    for (let key in values) {
      const value = values[key];
      entries.push(
        <div
          key={key}
          style={{
            padding: '10px',
            margin: '5px 0',
            backgroundColor: '#f5f5f5',
            borderRadius: '5px',
            border: '1px solid #ddd'
          }}
        >
          <strong>fib({key})</strong> = {value}
        </div>
      );
    }
    return entries.length > 0 ? entries : <em>No calculations yet</em>;
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>Fibonacci Calculator</h2>
      <p style={{ color: '#666' }}>
        Enter an index between 0 and 40 to calculate the Fibonacci number
      </p>

      {error && (
        <div
          style={{
            color: 'white',
            backgroundColor: '#d32f2f',
            padding: '10px 15px',
            margin: '15px 0',
            borderRadius: '5px'
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label htmlFor="index-input" style={{ fontWeight: 'bold' }}>
            Enter index:
          </label>
          <input
            id="index-input"
            type="number"
            min="0"
            max="40"
            step="1"
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            disabled={loading}
            placeholder="e.g., 10"
            required
            style={{
              padding: '8px 12px',
              fontSize: '16px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              width: '150px'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 20px',
              fontSize: '16px',
              backgroundColor: loading ? '#ccc' : '#61dafb',
              color: loading ? '#666' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </form>

      <div style={{ marginBottom: '30px' }}>
        <h3>Indexes I have seen:</h3>
        <div
          style={{
            padding: '15px',
            backgroundColor: '#f9f9f9',
            borderRadius: '5px',
            border: '1px solid #e0e0e0'
          }}
        >
          {renderSeenIndexes()}
        </div>
      </div>

      <div>
        <h3>Calculated Values:</h3>
        <div>{renderValues()}</div>
      </div>
    </div>
  );
}

export default Fib;
