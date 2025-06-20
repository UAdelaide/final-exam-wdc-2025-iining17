const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());

// Database connection configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password123', // Use the password you set earlier
  database: 'DogWalkService'
};

// Initialize database connection
let connection;

async function initializeDatabase() {
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to MySQL database');
    
    // Insert sample data for testing
    await insertSampleData();
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Function to insert sample data on startup
async function insertSampleData() {
  try {
    // Check if data already exists
    const [userRows] = await connection.execute('SELECT COUNT(*) as count FROM Users');
    if (userRows[0].count > 0) {
      console.log('Sample data already exists');
      return;
    }

    console.log('Inserting sample data...');

    // Insert Users
    await connection.execute(`
      INSERT INTO Users (username, email, password_hash, role, created_at) VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner', CURRENT_TIMESTAMP),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker', CURRENT_TIMESTAMP),
      ('carol123', 'carol@example.com', 'hashed789', 'owner', CURRENT_TIMESTAMP),
      ('davidwalker', 'david@example.com', 'hashed101', 'walker', CURRENT_TIMESTAMP),
      ('emilyowner', 'emily@example.com', 'hashed202', 'owner', CURRENT_TIMESTAMP)
    `);

    // Insert Dogs
    await connection.execute(`
      INSERT INTO Dogs (owner_id, name, size) VALUES
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Charlie', 'large'),
      ((SELECT user_id FROM Users WHERE username = 'emilyowner'), 'Luna', 'medium'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Rocky', 'large')
    `);

    // Insert WalkRequests
    await connection.execute(`
      INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status, created_at) VALUES
      ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open', CURRENT_TIMESTAMP),
      ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted', CURRENT_TIMESTAMP),
      ((SELECT dog_id FROM Dogs WHERE name = 'Charlie'), '2025-06-11 07:30:00', 60, 'Central Park', 'open', CURRENT_TIMESTAMP),
      ((SELECT dog_id FROM Dogs WHERE name = 'Luna'), '2025-06-11 16:00:00', 45, 'Dog Park North', 'completed', CURRENT_TIMESTAMP),
      ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'), '2025-06-12 18:00:00', 30, 'Riverside Trail', 'open', CURRENT_TIMESTAMP)
    `);

    // Insert WalkApplications
    await connection.execute(`
      INSERT INTO WalkApplications (request_id, walker_id, applied_at, status) VALUES
      ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max')), 
       (SELECT user_id FROM Users WHERE username = 'bobwalker'), 
       CURRENT_TIMESTAMP, 'pending'),
      ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella')), 
       (SELECT user_id FROM Users WHERE username = 'davidwalker'), 
       CURRENT_TIMESTAMP, 'accepted'),
      ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Luna')), 
       (SELECT user_id FROM Users WHERE username = 'davidwalker'), 
       CURRENT_TIMESTAMP, 'accepted')
    `);

    // Insert WalkRatings
    await connection.execute(`
      INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments, rated_at) VALUES
      ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella')), 
       (SELECT user_id FROM Users WHERE username = 'davidwalker'),
       (SELECT user_id FROM Users WHERE username = 'carol123'),
       5, 'Excellent service! David was very professional and Bella came back happy.', CURRENT_TIMESTAMP),
      ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Luna')), 
       (SELECT user_id FROM Users WHERE username = 'davidwalker'),
       (SELECT user_id FROM Users WHERE username = 'emilyowner'),
       4, 'Good walk, Luna seemed tired but satisfied. Would recommend.', CURRENT_TIMESTAMP)
    `);

    console.log('Sample data inserted successfully');
  } catch (error) {
    console.error('Error inserting sample data:', error);
  }
}

// API Routes

// 1. /api/dogs - Return all dogs with their size and owner's username
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await connection.execute(`
      SELECT 
        d.name as dog_name,
        d.size,
        u.username as owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
      ORDER BY d.name
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching dogs:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve dogs data'
    });
  }
});

// 2. /api/walkrequests/open - Return all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await connection.execute(`
      SELECT 
        wr.request_id,
        d.name as dog_name,
        wr.requested_time,
        wr.duration_minutes,
        wr.location,
        u.username as owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
      ORDER BY wr.requested_time
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching open walk requests:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve open walk requests'
    });
  }
});

// 3. /api/walkers/summary - Return walker summary with average rating and completed walks
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await connection.execute(`
      SELECT 
        u.username as walker_username,
        COUNT(DISTINCT wr.rating_id) as total_ratings,
        COALESCE(ROUND(AVG(wr.rating), 1), 0) as average_rating,
        COUNT(DISTINCT CASE WHEN wa.status = 'accepted' THEN wa.application_id END) as completed_walks
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id
      LEFT JOIN WalkRatings wr ON u.user_id = wr.walker_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
      ORDER BY u.username
    `);
    
    // Format the response to match the expected output
    const formattedRows = rows.map(row => ({
      walker_username: row.walker_username,
      total_ratings: row.total_ratings,
      average_rating: row.total_ratings > 0 ? row.average_rating : null,
      completed_walks: row.completed_walks
    }));
    
    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching walker summary:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve walker summary'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: `The route ${req.originalUrl} does not exist`
  });
});

// Start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(port, () => {
    console.log(`DogWalk API server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('- GET /api/dogs');
    console.log('- GET /api/walkrequests/open');
    console.log('- GET /api/walkers/summary');
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  if (connection) {
    await connection.end();
  }
  process.exit(0);
});

startServer().catch(console.error);