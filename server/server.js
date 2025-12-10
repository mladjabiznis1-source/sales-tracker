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

  CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    role TEXT,
    dials INTEGER DEFAULT 0,
    pick_ups INTEGER DEFAULT 0,
    dqs INTEGER DEFAULT 0,
    appts_pitched INTEGER DEFAULT 0,
    appts_set INTEGER DEFAULT 0,
    hybrid_closer TEXT,
    calls_scheduled INTEGER DEFAULT 0,
    live_calls INTEGER DEFAULT 0,
    prospect_email TEXT,
    call_date TEXT,
    offer_made TEXT,
    call_outcome TEXT,
    cash_collected REAL DEFAULT 0,
    revenue_generated REAL DEFAULT 0,
    call_notes TEXT,
    closer_name TEXT,
    setter_name TEXT,
    fathom_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// ============ GOOGLE FORM WEBHOOK (EOD Tracker) ============

// Webhook to receive Google Form submissions from EOD Tracker | Media 42
app.post('/api/webhook/google-form', (req, res) => {
  try {
    console.log('📥 Received Google Form submission:', req.body);
    
    const data = req.body;
    
    // Map form fields to database columns based on actual EOD Tracker form
    const entry = {
      timestamp: data['Timestamp'] || new Date().toISOString(),
      role: data['What is your role?'] || data.role || '',
      dials: parseInt(data['Dials made?'] || data.dials || 0),
      pick_ups: parseInt(data['Pick ups?'] || data.pickUps || 0),
      dqs: parseInt(data["DQ's?"] || data.dqs || 0),
      appts_pitched: parseInt(data["Appt's Pitched?"] || data.apptsPitched || 0),
      appts_set: parseInt(data["Appt's Set?"] || data.apptsSet || 0),
      hybrid_closer: data['Hybrid Closer?'] || data.hybridCloser || '',
      calls_scheduled: parseInt(data['Calls Scheduled?'] || data.callsScheduled || 0),
      live_calls: parseInt(data['LIVE Calls?'] || data.liveCalls || 0),
      prospect_email: data['Prospect Email'] || data.prospectEmail || '',
      call_date: data['Date Call Was Taken'] || data.callDate || '',
      offer_made: data['Offer Made'] || data.offerMade || '',
      call_outcome: data['Call Outcome'] || data.callOutcome || '',
      cash_collected: parseFloat(data['Cash Collected\nThe amount of cash collected today (ex 4000, 2000, 1500)'] || data['Cash Collected'] || data.cashCollected || 0),
      revenue_generated: parseFloat(data['Revenue Generated\nThe total value of the contract (ex: 4000, 4500)'] || data['Revenue Generated'] || data.revenueGenerated || 0),
      call_notes: data['Call Notes'] || data.callNotes || '',
      closer_name: data['Closer Name'] || data.closerName || '',
      setter_name: data['Setter Name'] || data.setterName || '',
      fathom_link: data['Fathom Link'] || data.fathomLink || ''
    };

    // Insert into form_submissions table
    const result = db.prepare(`
      INSERT INTO form_submissions (
        timestamp, role, dials, pick_ups, dqs, appts_pitched, appts_set,
        hybrid_closer, calls_scheduled, live_calls, prospect_email, call_date,
        offer_made, call_outcome, cash_collected, revenue_generated,
        call_notes, closer_name, setter_name, fathom_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.timestamp,
      entry.role,
      entry.dials,
      entry.pick_ups,
      entry.dqs,
      entry.appts_pitched,
      entry.appts_set,
      entry.hybrid_closer,
      entry.calls_scheduled,
      entry.live_calls,
      entry.prospect_email,
      entry.call_date,
      entry.offer_made,
      entry.call_outcome,
      entry.cash_collected,
      entry.revenue_generated,
      entry.call_notes,
      entry.closer_name,
      entry.setter_name,
      entry.fathom_link
    );

    console.log('✅ Form submission saved with ID:', result.lastInsertRowid);
    res.json({ success: true, id: result.lastInsertRowid, message: 'Form submission saved' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Failed to save form submission', details: error.message });
  }
});

// Get all form submissions for the new forms page
app.get('/api/forms/entries', (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT 
        id,
        timestamp,
        role,
        dials,
        pick_ups as pickUps,
        dqs,
        appts_pitched as apptsPitched,
        appts_set as apptsSet,
        hybrid_closer as hybridCloser,
        calls_scheduled as callsScheduled,
        live_calls as liveCalls,
        prospect_email as prospectEmail,
        call_date as callDate,
        offer_made as offerMade,
        call_outcome as callOutcome,
        cash_collected as cashCollected,
        revenue_generated as revenueGenerated,
        call_notes as callNotes,
        closer_name as closerName,
        setter_name as setterName,
        fathom_link as fathomLink,
        created_at as createdAt
      FROM form_submissions 
      ORDER BY created_at DESC
    `).all();
    
    res.json({ entries });
  } catch (error) {
    console.error('Get form entries error:', error);
    res.status(500).json({ error: 'Server error' });
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
