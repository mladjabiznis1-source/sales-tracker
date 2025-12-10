const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new Database(path.join(__dirname, 'sales_tracker.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    role TEXT NOT NULL,
    booked_calls INTEGER DEFAULT 0,
    no_shows INTEGER DEFAULT 0,
    closed_won INTEGER DEFAULT 0,
    closed_lost INTEGER DEFAULT 0,
    pif INTEGER DEFAULT 0,
    splits INTEGER DEFAULT 0,
    cash_collected REAL DEFAULT 0,
    renewals_cash REAL DEFAULT 0,
    reschedules INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: 'sales-tracker-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ============ AUTH ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, hashedPassword, name);
    
    // Auto login
    req.session.userId = result.lastInsertRowid;
    req.session.userName = name;

    res.json({ success: true, user: { id: result.lastInsertRowid, name, email } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    req.session.userName = user.name;

    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  res.json({ 
    user: { 
      id: req.session.userId, 
      name: req.session.userName 
    } 
  });
});

// ============ GOOGLE FORM WEBHOOK ============

// Webhook to receive Google Form submissions
// This endpoint receives data from Google Apps Script when a form is submitted
app.post('/api/webhook/google-form', (req, res) => {
  try {
    console.log('📥 Received Google Form submission:', req.body);
    
    const data = req.body;
    
    // Map form fields to database columns
    // The field names should match what's sent from Google Apps Script
    const entry = {
      date: data.date || new Date().toISOString().split('T')[0],
      role: data.role || 'Closer',
      booked_calls: parseInt(data.bookedCalls || data['Booked Calls'] || 0),
      no_shows: parseInt(data.noShows || data['No Shows'] || 0),
      closed_won: parseInt(data.closedWon || data['Closed Won'] || 0),
      closed_lost: parseInt(data.closedLost || data['Closed Lost'] || 0),
      pif: parseInt(data.pif || data['PIF'] || 0),
      splits: parseInt(data.splits || data['Splits'] || 0),
      cash_collected: parseFloat(data.cashCollected || data['Cash Collected'] || 0),
      renewals_cash: parseFloat(data.renewalsCash || data['Renewals Cash'] || data['Renewals Cash Collected'] || 0),
      reschedules: parseInt(data.reschedules || data['Reschedules'] || 0)
    };

    // Get or create a default user for form submissions
    let user = db.prepare('SELECT id FROM users WHERE email = ?').get('google-form@webhook.local');
    if (!user) {
      const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(
        'google-form@webhook.local',
        'webhook-user-no-login',
        'Google Form Submissions'
      );
      user = { id: result.lastInsertRowid };
    }

    // Insert the entry
    const result = db.prepare(`
      INSERT INTO entries (user_id, date, role, booked_calls, no_shows, closed_won, closed_lost, pif, splits, cash_collected, renewals_cash, reschedules)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      entry.date,
      entry.role,
      entry.booked_calls,
      entry.no_shows,
      entry.closed_won,
      entry.closed_lost,
      entry.pif,
      entry.splits,
      entry.cash_collected,
      entry.renewals_cash,
      entry.reschedules
    );

    console.log('✅ Entry saved with ID:', result.lastInsertRowid);
    res.json({ success: true, id: result.lastInsertRowid, message: 'Form submission saved' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Failed to save form submission', details: error.message });
  }
});

// Get all form submissions (public endpoint for dashboard)
app.get('/api/webhook/entries', (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT id, date, role, booked_calls as bookedCalls, no_shows as noShows, 
             closed_won as closedWon, closed_lost as closedLost, pif, splits, 
             cash_collected as cashCollected, renewals_cash as renewalsCash, reschedules,
             created_at as createdAt
      FROM entries 
      ORDER BY date DESC, created_at DESC
    `).all();
    
    res.json({ entries });
  } catch (error) {
    console.error('Get webhook entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ ENTRIES ROUTES ============

// Get all entries for user
app.get('/api/entries', requireAuth, (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT id, date, role, booked_calls as bookedCalls, no_shows as noShows, 
             closed_won as closedWon, closed_lost as closedLost, pif, splits, cash_collected as cashCollected, 
             renewals_cash as renewalsCash, reschedules
      FROM entries 
      WHERE user_id = ? 
      ORDER BY date DESC
    `).all(req.session.userId);
    
    res.json({ entries });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add entry
app.post('/api/entries', requireAuth, (req, res) => {
  try {
    const { date, role, bookedCalls, noShows, closedWon, closedLost, pif, splits, cashCollected, renewalsCash, reschedules } = req.body;
    
    const result = db.prepare(`
      INSERT INTO entries (user_id, date, role, booked_calls, no_shows, closed_won, closed_lost, pif, splits, cash_collected, renewals_cash, reschedules)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.session.userId, date, role, bookedCalls || 0, noShows || 0, closedWon || 0, closedLost || 0, pif || 0, splits || 0, cashCollected || 0, renewalsCash || 0, reschedules || 0);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Add entry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update entry
app.put('/api/entries/:id', requireAuth, (req, res) => {
  try {
    const { date, role, bookedCalls, noShows, closedWon, closedLost, pif, splits, cashCollected, renewalsCash, reschedules } = req.body;
    
    // Verify ownership
    const entry = db.prepare('SELECT user_id FROM entries WHERE id = ?').get(req.params.id);
    if (!entry || entry.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    db.prepare(`
      UPDATE entries SET date = ?, role = ?, booked_calls = ?, no_shows = ?, closed_won = ?, closed_lost = ?,
             pif = ?, splits = ?, cash_collected = ?, renewals_cash = ?, reschedules = ?
      WHERE id = ? AND user_id = ?
    `).run(date, role, bookedCalls, noShows, closedWon, closedLost || 0, pif, splits, cashCollected, renewalsCash, reschedules, req.params.id, req.session.userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Update entry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete entry
app.delete('/api/entries/:id', requireAuth, (req, res) => {
  try {
    // Verify ownership
    const entry = db.prepare('SELECT user_id FROM entries WHERE id = ?').get(req.params.id);
    if (!entry || entry.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Sales Tracker server running at http://localhost:${PORT}`);
});
