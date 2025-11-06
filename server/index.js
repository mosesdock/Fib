const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// CORS configuration with origin validation
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3050'];

    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// PostgreSQL Client Setup with connection pooling
const { Pool } = require('pg');
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort,
  max: 20,                      // Maximum number of clients in pool
  idleTimeoutMillis: 30000,     // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if no connection
});

pgClient.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

pgClient.on('connect', () => {
  console.log('PostgreSQL client connected');
});

// Initialize database table
const initializeDatabase = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS values (
      id SERIAL PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_values_number ON values(number);
  `;

  try {
    await pgClient.query(createTableQuery);
    console.log('Database table initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database table:', err);
    process.exit(1);
  }
};

initializeDatabase();

// Redis Client Setup with new v4 API
const redis = require('redis');
const redisClient = redis.createClient({
  socket: {
    host: keys.redisHost,
    port: keys.redisPort,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis max retry attempts reached');
        return new Error('Redis retry limit exceeded');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

const redisPublisher = redisClient.duplicate();

// Redis error handlers
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));

// Redis connect handlers
redisClient.on('connect', () => console.log('Redis client connected'));
redisPublisher.on('connect', () => console.log('Redis publisher connected'));

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    await redisPublisher.connect();
    console.log('Redis connections established');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

// Express route handlers

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Fibonacci Calculator API',
    version: '2.0.0'
  });
});

app.get('/values/all', async (req, res) => {
  try {
    const values = await pgClient.query('SELECT * FROM values ORDER BY number ASC');
    res.status(200).json(values.rows);
  } catch (error) {
    console.error('Database error fetching values:', error);
    res.status(500).json({
      error: 'Failed to fetch values from database'
    });
  }
});

app.get('/values/current', async (req, res) => {
  try {
    const values = await redisClient.hGetAll('values');
    res.status(200).json(values || {});
  } catch (error) {
    console.error('Redis error fetching values:', error);
    res.status(500).json({
      error: 'Failed to fetch current values from cache'
    });
  }
});

app.post('/values', async (req, res) => {
  const index = req.body.index;

  // Comprehensive input validation
  if (index === undefined || index === null || index === '') {
    return res.status(400).json({ error: 'Index is required' });
  }

  const parsedIndex = parseInt(index, 10);

  if (isNaN(parsedIndex)) {
    return res.status(400).json({ error: 'Index must be a valid number' });
  }

  if (parsedIndex < 0) {
    return res.status(400).json({ error: 'Index must be non-negative' });
  }

  if (parsedIndex > 40) {
    return res.status(422).json({ error: 'Index too high (maximum: 40)' });
  }

  // Check if it's an integer
  if (parsedIndex !== parseFloat(index)) {
    return res.status(400).json({ error: 'Index must be an integer' });
  }

  try {
    // Set placeholder in Redis
    await redisClient.hSet('values', parsedIndex.toString(), 'Calculating...');

    // Publish to worker queue
    await redisPublisher.publish('insert', parsedIndex.toString());

    // Store in PostgreSQL
    await pgClient.query(
      'INSERT INTO values(number) VALUES($1) ON CONFLICT (number) DO NOTHING',
      [parsedIndex]
    );

    res.status(201).json({
      working: true,
      index: parsedIndex,
      message: 'Calculation started'
    });
  } catch (error) {
    console.error('Error saving value:', error);
    res.status(500).json({
      error: 'Internal server error while processing request'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close database connection pool
      await pgClient.end();
      console.log('PostgreSQL connection pool closed');

      // Close Redis connections
      await redisClient.quit();
      await redisPublisher.quit();
      console.log('Redis connections closed');

      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
