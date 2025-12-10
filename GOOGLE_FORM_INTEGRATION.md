# Google Form Integration Guide

This guide explains how to connect your Google Form "EOD Tracker | Media 42" to the Sales Performance Tracker.

---

## Overview

When someone submits the Google Form, the data will automatically be sent to your Sales Tracker server and appear in the dashboard.

---

## Prerequisites

1. **Your server must be running** and accessible from the internet (for production)
2. **Access to the Google Form** (you must be the owner or editor)
3. **The form's linked Google Sheet** (created automatically when form responses are collected)

---

## Step 1: Get Your Server URL

### For Local Development
```
http://localhost:3000/api/webhook/google-form
```

### For Production
You'll need to deploy your server to a hosting service (Heroku, Railway, Render, etc.) and use that URL:
```
https://your-app-name.herokuapp.com/api/webhook/google-form
```

---

## Step 2: Open the Form's Linked Spreadsheet

1. Open your Google Form: https://docs.google.com/forms/d/e/1FAIpQLSfX4Hi3FXMe10nBdRklFgzC33BKSLx9xAGUNTZrfDUUkuko3w/viewform
2. Click the **"Responses"** tab
3. Click the **Google Sheets icon** (green) to open the linked spreadsheet
4. If no spreadsheet exists, click "Create Spreadsheet"

---

## Step 3: Add the Google Apps Script

1. In the Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Paste the following code:

```javascript
// ============================================
// GOOGLE FORM TO SALES TRACKER WEBHOOK
// ============================================

// IMPORTANT: Replace this with your actual server URL
const WEBHOOK_URL = 'http://localhost:3000/api/webhook/google-form';

// Field mapping: Map your form question titles to the expected field names
// Adjust these based on your actual form questions
const FIELD_MAPPING = {
  'Date': 'date',
  'Role': 'role',
  'Booked Calls': 'bookedCalls',
  'No Shows': 'noShows',
  'Closed Won': 'closedWon',
  'Closed Lost': 'closedLost',
  'PIF': 'pif',
  'Splits': 'splits',
  'Cash Collected': 'cashCollected',
  'Renewals Cash': 'renewalsCash',
  'Renewals Cash Collected': 'renewalsCash',
  'Reschedules': 'reschedules',
  // Add more mappings if your form has different question titles
  'Timestamp': '_timestamp' // Ignore timestamp
};

/**
 * Triggered when a form response is submitted
 * This function sends the form data to your Sales Tracker server
 */
function onFormSubmit(e) {
  try {
    // Get the form response
    const response = e.response || e.namedValues;
    let data = {};
    
    if (e.namedValues) {
      // Triggered from spreadsheet
      for (const [question, answers] of Object.entries(e.namedValues)) {
        const fieldName = FIELD_MAPPING[question] || question.toLowerCase().replace(/\s+/g, '');
        if (!fieldName.startsWith('_')) {
          data[fieldName] = answers[0]; // Get first answer
        }
      }
    } else if (e.response) {
      // Triggered from form
      const itemResponses = e.response.getItemResponses();
      for (const itemResponse of itemResponses) {
        const question = itemResponse.getItem().getTitle();
        const answer = itemResponse.getResponse();
        const fieldName = FIELD_MAPPING[question] || question.toLowerCase().replace(/\s+/g, '');
        if (!fieldName.startsWith('_')) {
          data[fieldName] = answer;
        }
      }
    }
    
    // Ensure date is in correct format (YYYY-MM-DD)
    if (data.date) {
      const dateObj = new Date(data.date);
      if (!isNaN(dateObj.getTime())) {
        data.date = dateObj.toISOString().split('T')[0];
      }
    } else {
      // Use today's date if not provided
      data.date = new Date().toISOString().split('T')[0];
    }
    
    // Send to webhook
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    
    const result = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = result.getResponseCode();
    const responseText = result.getContentText();
    
    // Log the result
    console.log(`Webhook response: ${responseCode} - ${responseText}`);
    
    if (responseCode !== 200) {
      console.error(`Webhook failed with status ${responseCode}: ${responseText}`);
    }
    
  } catch (error) {
    console.error('Error sending to webhook:', error);
  }
}

/**
 * Test function - run this manually to test the webhook connection
 */
function testWebhook() {
  const testData = {
    date: new Date().toISOString().split('T')[0],
    role: 'Closer',
    bookedCalls: 10,
    noShows: 2,
    closedWon: 5,
    pif: 2,
    splits: 1,
    cashCollected: 15000,
    renewalsCash: 2000,
    reschedules: 1
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(testData),
    muteHttpExceptions: true
  };
  
  try {
    const result = UrlFetchApp.fetch(WEBHOOK_URL, options);
    console.log('Test result:', result.getResponseCode(), result.getContentText());
    
    // Show alert in Apps Script
    SpreadsheetApp.getUi().alert(
      'Webhook Test Result',
      `Status: ${result.getResponseCode()}\nResponse: ${result.getContentText()}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    console.error('Test failed:', error);
    SpreadsheetApp.getUi().alert('Test Failed', error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Sets up the form submit trigger
 * Run this function once to enable automatic submissions
 */
function setupTrigger() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Create new trigger
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
  
  SpreadsheetApp.getUi().alert(
    'Trigger Created',
    'The form submit trigger has been set up. Form responses will now be sent to your Sales Tracker.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
```

4. Click **Save** (Ctrl+S or Cmd+S)
5. Name the project (e.g., "Sales Tracker Webhook")

---

## Step 4: Configure the Webhook URL

In the script, find this line and replace it with your actual server URL:

```javascript
const WEBHOOK_URL = 'http://localhost:3000/api/webhook/google-form';
```

For production, use your deployed server URL.

---

## Step 5: Set Up the Trigger

1. In the Apps Script editor, select **`setupTrigger`** from the function dropdown (next to the Run button)
2. Click **Run**
3. You'll be asked to authorize the script - click through the permissions
4. A confirmation alert will appear

---

## Step 6: Test the Integration

### Option A: Test with the Test Function
1. Select **`testWebhook`** from the function dropdown
2. Click **Run**
3. Check the result in the alert dialog

### Option B: Submit a Real Form Response
1. Open your Google Form
2. Fill out and submit a response
3. Check your Sales Tracker dashboard - the data should appear

---

## Troubleshooting

### "Script function not found: onFormSubmit"
- Make sure you saved the script
- Run `setupTrigger` again

### "Exception: Request failed"
- Check that your server is running
- Verify the WEBHOOK_URL is correct
- For local development, the server must be accessible (consider using ngrok for testing)

### Data not appearing in dashboard
1. Check the server console for incoming webhook requests
2. Verify the field mapping matches your form questions
3. Check the browser console for any errors

### Form questions don't match expected fields
Update the `FIELD_MAPPING` object in the script to match your actual form question titles.

---

## Field Mapping Reference

Your form questions should map to these fields:

| Form Question | Expected Field |
|--------------|----------------|
| Date | date |
| Role | role |
| Booked Calls | bookedCalls |
| No Shows | noShows |
| Closed Won | closedWon |
| Closed Lost | closedLost |
| PIF | pif |
| Splits | splits |
| Cash Collected | cashCollected |
| Renewals Cash / Renewals Cash Collected | renewalsCash |
| Reschedules | reschedules |

---

## Making Your Server Publicly Accessible

### For Local Testing with ngrok

1. Install ngrok: `brew install ngrok` (Mac) or download from ngrok.com
2. Start your server: `node server/server.js`
3. In another terminal: `ngrok http 3000`
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Update WEBHOOK_URL in Apps Script to: `https://abc123.ngrok.io/api/webhook/google-form`

### For Production Deployment

Deploy your server to a cloud platform:
- **Heroku**: `git push heroku main`
- **Railway**: Connect your GitHub repo
- **Render**: Connect your GitHub repo
- **Vercel**: For serverless deployment

Then update the WEBHOOK_URL to your production URL.

---

## Security Considerations

For production use, consider adding:

1. **API Key Authentication**: Add a secret key to verify requests
2. **Rate Limiting**: Prevent abuse
3. **Input Validation**: Sanitize incoming data

Example with API key:
```javascript
// In Apps Script
const API_KEY = 'your-secret-key';
const options = {
  method: 'POST',
  contentType: 'application/json',
  headers: { 'X-API-Key': API_KEY },
  payload: JSON.stringify(data)
};

// In server.js
app.post('/api/webhook/google-form', (req, res) => {
  if (req.headers['x-api-key'] !== process.env.WEBHOOK_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... rest of handler
});
```
