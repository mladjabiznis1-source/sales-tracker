# Sales Performance Tracker

A complete sales performance tracking system with Google Sheets backend and Looker Studio dashboard.

---

## 📁 Files Included

| File | Description |
|------|-------------|
| `sales_data_template.csv` | Sample data to import into Google Sheets |
| `GOOGLE_SHEETS_SETUP.md` | Step-by-step Google Sheets configuration |
| `LOOKER_STUDIO_SETUP.md` | Complete Looker Studio dashboard guide |
| `TROUBLESHOOTING.md` | Solutions for common issues |
| `CALCULATED_FIELDS_REFERENCE.md` | Copy-paste formulas for Looker Studio |

---

## 🚀 Quick Start

### Step 1: Set Up Google Sheets (10 minutes)
1. Create a new Google Sheet
2. Import `sales_data_template.csv`
3. Follow `GOOGLE_SHEETS_SETUP.md`

### Step 2: Create Looker Studio Dashboard (30 minutes)
1. Go to [lookerstudio.google.com](https://lookerstudio.google.com)
2. Connect your Google Sheet
3. Follow `LOOKER_STUDIO_SETUP.md`

### Step 3: Customize & Share
1. Adjust colors and layout to preference
2. Share with your team

---

## 📊 Metrics Tracked

### Core Metrics (Raw Data)
- **Booked Calls** - Total scheduled calls
- **No Shows** - Prospects who didn't show
- **Closed Won** - Successful sales
- **PIF** - Paid In Full deals
- **Splits** - Deals split with another rep
- **Cash Collected** - Revenue from new sales
- **Renewals Cash Collected** - Revenue from renewals
- **Reschedules** - Calls rescheduled

### Performance Metrics (Calculated)
- **No Show Rate** - No Shows ÷ Booked Calls
- **Show-Up Rate** - 1 - No Show Rate
- **Close Rate** - Closed Won ÷ Show-Ups
- **Split Rate** - Splits ÷ Closed Won
- **Cash Per Show-Up** - Cash ÷ Show-Ups
- **Cash Per Day** - Cash ÷ Unique Days
- **Monthly Pacing** - Cash Per Day × 30

---

## 🎨 Dashboard Features

### Visual Design
- ✅ Dark theme (black background)
- ✅ Modern card-based layout
- ✅ Rounded rectangle scorecards
- ✅ Clean spacing and typography

### Functionality
- ✅ Date range filter with comparison
- ✅ Role filter (Closer, Setter, PCF)
- ✅ Period-over-period comparison
- ✅ Up/down arrows with percentages
- ✅ Color-coded changes (green/red)

### Smart Color Coding
- **Green = Good**: Increases in revenue, close rate, etc.
- **Red = Bad**: Increases in no-shows, reschedules, etc.
- **Inverted for negative metrics**: Lower no-shows shows green

---

## 📋 Data Entry Guidelines

### Format Requirements
```
Date: YYYY-MM-DD (e.g., 2024-12-08)
Role: Exactly "Closer", "Setter", or "PCF"
Numbers: Plain integers (no commas)
Currency: Plain numbers (no $ symbol)
Empty values: Use 0, never leave blank
```

### Example Row
```
2024-12-08 | Closer | 15 | 2 | 8 | 3 | 2 | 24500 | 3200 | 1
```

---

## 🔧 Maintenance

### Daily
- Add new data rows to Google Sheet
- Data auto-syncs to Looker Studio

### Weekly
- Review dashboard for accuracy
- Check for any error messages

### Monthly
- Archive old data if sheet gets large
- Review and adjust targets/benchmarks

---

## ⚠️ Important Notes

1. **Never delete the header row** in Google Sheets
2. **Keep Role values consistent** - exact spelling matters
3. **Use 0 for empty metrics** - blank cells cause errors
4. **Date format must be YYYY-MM-DD** for proper sorting

---

## 🆘 Need Help?

1. Check `TROUBLESHOOTING.md` for common issues
2. Verify data format in Google Sheets
3. Ensure proper sharing permissions
4. Try refreshing the Looker Studio report

---

## 📈 Extending the System

### Add New Roles
1. In Google Sheets, add rows with new role name
2. In Looker Studio, the filter will auto-update

### Add New Metrics
1. Add column to Google Sheets
2. In Looker Studio: Resource → Manage data sources → Edit
3. New field will appear automatically

### Create Additional Views
1. Duplicate existing scorecards
2. Add charts (line, bar) for trends
3. Create separate pages for different views

---

## 📄 License

Free to use and modify for your business needs.
