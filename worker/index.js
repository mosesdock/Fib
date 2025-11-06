const keys = require('./keys');
const redis = require('redis');

// Create Redis clients with new v4 API
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

const sub = redisClient.duplicate();

// Error handlers
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
sub.on('error', (err) => console.error('Redis Subscriber Error:', err));

// Connect handlers
redisClient.on('connect', () => console.log('Redis client connected'));
sub.on('connect', () => console.log('Redis subscriber connected'));

// Optimized iterative Fibonacci - O(n) time, O(1) space
// Prevents DOS attacks - completes fib(40) in microseconds instead of 30+ seconds
function fib(index) {
  if (index < 2) return 1;

  let prev = 1;
  let current = 1;

  for (let i = 2; i <= index; i++) {
    const next = prev + current;
    prev = current;
    current = next;
  }

  return current;
}

// Initialize Redis connections and start listening
(async () => {
  try {
    await redisClient.connect();
    await sub.connect();

    await sub.subscribe('insert', async (message) => {
      try {
        const index = parseInt(message, 10);

        if (isNaN(index) || index < 0 || index > 40) {
          console.error(`Invalid message received: ${message}`);
          return;
        }

        console.log(`Calculating Fibonacci for index: ${index}`);
        const result = fib(index);

        await redisClient.hSet('values', index.toString(), result.toString());
        console.log(`Successfully calculated fib(${index}) = ${result}`);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    console.log('Worker is ready and listening for messages...');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisClient.quit();
  await sub.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await redisClient.quit();
  await sub.quit();
  process.exit(0);
});
