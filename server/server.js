const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://blfbnccqcdlbbocmuxui.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZmJuY2NxY2RsYmJvY211eHVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMjc2OTIsImV4cCI6MjA4MDkwMzY5Mn0.aQnrk4hxkED0sbPluwIboecxkHJQyIG-By9FI_Pq2Hc';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Sales Tracker API running', database: 'Supabase' });
});

// ============ GOOGLE FORM WEBHOOK ============

// Helper function to find a field by checking multiple possible names
function findField(data, fieldNames) {
  for (const name of fieldNames) {
    if (data[name] !== undefined && data[name] !== '') {
      return data[name];
    }
    for (const key of Object.keys(data)) {
      if (key.startsWith(name.split('\n')[0]) && data[key] !== undefined && data[key] !== '') {
        return data[key];
      }
    }
  }
  return null;
}

// Webhook to receive Google Form submissions
app.post('/api/webhook/google-form', async (req, res) => {
  try {
    console.log('📥 Received Google Form submission:', req.body);
    
    const data = req.body;
    
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
      call_date: data['Date Call Was Taken'] || data['Date'] || data.callDate || data.date || '',
      offer_made: data['Offer Made'] || data.offerMade || '',
      call_outcome: data['Call Outcome'] || data.callOutcome || '',
      cash_collected: parseFloat(findField(data, ['Cash Collected\nThe amount of cash collected today (ex 4000, 2000, 1500)', 'Cash Collected', 'cashCollected']) || 0),
      revenue_generated: parseFloat(findField(data, ['Revenue Generated\nThe total value of the contract (ex: 4000, 4500)', 'Revenue Generated', 'revenueGenerated']) || 0),
      call_notes: data['Call Notes'] || data.callNotes || '',
      closer_name: data['Closer Name'] || data.closerName || '',
      setter_name: data['Setter Name'] || data['Setter'] || data.setterName || '',
      fathom_link: data['Fathom Link'] || data.fathomLink || ''
    };

    const { data: result, error } = await supabase
      .from('form_submissions')
      .insert([entry])
      .select();

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: 'Failed to save', details: error.message });
    }

    console.log('✅ Entry saved:', result);
    res.json({ success: true, id: result[0]?.id, message: 'Form submission saved' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Failed to save form submission', details: error.message });
  }
});

// Get all form submissions
app.get('/api/forms/entries', async (req, res) => {
  try {
    const { data: entries, error } = await supabase
      .from('form_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch entries' });
    }

    // Map column names to camelCase for frontend
    const mappedEntries = entries.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      role: e.role,
      dials: e.dials,
      pickUps: e.pick_ups,
      dqs: e.dqs,
      apptsPitched: e.appts_pitched,
      apptsSet: e.appts_set,
      hybridCloser: e.hybrid_closer,
      callsScheduled: e.calls_scheduled,
      liveCalls: e.live_calls,
      prospectEmail: e.prospect_email,
      callDate: e.call_date,
      offerMade: e.offer_made,
      callOutcome: e.call_outcome,
      cashCollected: e.cash_collected,
      revenueGenerated: e.revenue_generated,
      callNotes: e.call_notes,
      closerName: e.closer_name,
      setterName: e.setter_name,
      fathomLink: e.fathom_link,
      createdAt: e.created_at
    }));

    res.json({ entries: mappedEntries });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Using Supabase database`);
});
