# Looker Studio Dashboard Setup Guide

## Overview

This guide walks you through creating a professional Sales Performance Tracker dashboard with:
- Dark theme design
- Period-over-period comparisons
- Color-coded metrics
- Automatic calculations

---

## Step 1: Create New Report

1. Go to [Looker Studio](https://lookerstudio.google.com)
2. Click **+ Create → Report**
3. Name it: `Sales Performance Tracker`

---

## Step 2: Connect Google Sheets Data Source

1. In the data source panel, click **Google Sheets**
2. Find and select your `Sales Performance Tracker - Data` spreadsheet
3. Select the sheet with your data (usually "Sheet1")
4. Click **Add**
5. Click **Add to Report** when prompted

---

## Step 3: Configure Data Source Fields

After connecting, click **Resource → Manage added data sources → Edit**

### Set Field Types:

| Field | Type | Aggregation |
|-------|------|-------------|
| Date | Date | None |
| Role | Text | None |
| Booked Calls | Number | Sum |
| No Shows | Number | Sum |
| Closed Won | Number | Sum |
| PIF | Number | Sum |
| Splits | Number | Sum |
| Cash Collected | Currency (USD) | Sum |
| Renewals Cash Collected | Currency (USD) | Sum |
| Reschedules | Number | Sum |

Click **Done** then **Close**

---

## Step 4: Create Calculated Fields

Go to **Resource → Manage added data sources → Edit → Add a Field**

### Field 1: Show Ups
```
Name: Show Ups
Formula: Booked Calls - No Shows
Type: Number
```

### Field 2: No Show Rate
```
Name: No Show Rate
Formula: CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE SUM(No Shows) / SUM(Booked Calls) END
Type: Percent
```

### Field 3: Show-Up Rate
```
Name: Show-Up Rate
Formula: CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE 1 - (SUM(No Shows) / SUM(Booked Calls)) END
Type: Percent
```

### Field 4: Close Rate
```
Name: Close Rate
Formula: CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Closed Won) / (SUM(Booked Calls) - SUM(No Shows)) END
Type: Percent
```

### Field 5: Split Rate
```
Name: Split Rate
Formula: CASE WHEN SUM(Closed Won) = 0 THEN 0 ELSE SUM(Splits) / SUM(Closed Won) END
Type: Percent
```

### Field 6: Cash Per Show-Up
```
Name: Cash Per Show-Up
Formula: CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Cash Collected) / (SUM(Booked Calls) - SUM(No Shows)) END
Type: Currency (USD)
```

### Field 7: Unique Days
```
Name: Unique Days
Formula: COUNT_DISTINCT(Date)
Type: Number
```

### Field 8: Cash Per Day
```
Name: Cash Per Day
Formula: CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE SUM(Cash Collected) / COUNT_DISTINCT(Date) END
Type: Currency (USD)
```

### Field 9: Monthly Pacing
```
Name: Monthly Pacing
Formula: CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE (SUM(Cash Collected) / COUNT_DISTINCT(Date)) * 30 END
Type: Currency (USD)
```

Click **Done** after adding all fields.

---

## Step 5: Set Up Dark Theme

1. Click anywhere on the canvas (not on a chart)
2. In the right panel, click **Theme and Layout**
3. Click **Customize**
4. Set these values:

### Report Background:
- **Color:** `#0D0D0D` (near black)

### Accent Colors:
- **Primary:** `#00D4AA` (teal/green)
- **Secondary:** `#FF6B6B` (coral red)

### Font:
- **Family:** Inter, Roboto, or Arial
- **Color:** `#FFFFFF` (white)

---

## Step 6: Add Date Range Filter

1. **Add a control → Date range control**
2. Position at top-left of dashboard
3. In the right panel:
   - **Default date range:** Last 7 days
   - Check **Enable comparison date range**
   - **Comparison period:** Previous period
4. Style settings:
   - Background: `#1A1A1A`
   - Border radius: 8px
   - Font color: `#FFFFFF`

---

## Step 7: Add Role Filter

1. **Add a control → Drop-down list**
2. Position next to date range filter
3. Configure:
   - **Control field:** Role
   - **Metric:** None
   - Check **Allow "All" option**
4. Style:
   - Background: `#1A1A1A`
   - Border radius: 8px
   - Font color: `#FFFFFF`

---

## Step 8: Create Scorecard Template

### Basic Scorecard Setup:

1. **Add a chart → Scorecard**
2. Configure in DATA tab:
   - **Metric:** (varies per card)
   - **Comparison date range:** From date range control
3. Configure in STYLE tab:
   - Background: `#1E1E1E`
   - Border radius: 12px
   - Padding: 16px

### Enable Comparison:

1. In DATA tab, scroll to **Comparison date range**
2. Select **Auto** (uses date range control's comparison)
3. Check **Show absolute change** OR **Show percentage change**

---

## Step 9: Create Top Row - Core Metrics (7 Scorecards)

Create 7 scorecards with these configurations:

### Scorecard 1: Booked Calls
```
Metric: Booked Calls
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 2: No Shows ⚠️ INVERTED
```
Metric: No Shows
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #FF6B6B (red) ← INVERTED
Negative color: #00D4AA (green) ← INVERTED
```

### Scorecard 3: Closed Won
```
Metric: Closed Won
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 4: PIF
```
Metric: PIF
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 5: Splits
```
Metric: Splits
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 6: Cash Collected
```
Metric: Cash Collected
Aggregation: SUM
Format: Currency
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 7: Renewals Cash Collected
```
Metric: Renewals Cash Collected
Aggregation: SUM
Format: Currency
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

---

## Step 10: Create Bottom Row - Performance Metrics (8 Scorecards)

### Scorecard 8: Reschedules ⚠️ INVERTED
```
Metric: Reschedules
Aggregation: SUM
Comparison: Show % change
Arrow: Show
Positive color: #FF6B6B (red) ← INVERTED
Negative color: #00D4AA (green) ← INVERTED
```

### Scorecard 9: No Show Rate ⚠️ INVERTED
```
Metric: No Show Rate (calculated field)
Format: Percent (2 decimals)
Comparison: Show % change
Arrow: Show
Positive color: #FF6B6B (red) ← INVERTED
Negative color: #00D4AA (green) ← INVERTED
```

### Scorecard 10: Show-Up Rate
```
Metric: Show-Up Rate (calculated field)
Format: Percent (2 decimals)
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 11: Close Rate
```
Metric: Close Rate (calculated field)
Format: Percent (2 decimals)
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 12: Split Rate
```
Metric: Split Rate (calculated field)
Format: Percent (2 decimals)
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 13: Cash Per Show-Up
```
Metric: Cash Per Show-Up (calculated field)
Format: Currency
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 14: Cash Per Day
```
Metric: Cash Per Day (calculated field)
Format: Currency
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

### Scorecard 15: Monthly Pacing
```
Metric: Monthly Pacing (calculated field)
Format: Currency
Comparison: Show % change
Arrow: Show
Positive color: #00D4AA (green)
Negative color: #FF6B6B (red)
```

---

## Step 11: Style Each Scorecard

For each scorecard, apply these styles:

### STYLE Tab Settings:

**Primary Metric:**
- Font size: 32px
- Font weight: Bold
- Color: `#FFFFFF`

**Comparison:**
- Font size: 14px
- Show delta arrow: ✓
- Positive color: `#00D4AA`
- Negative color: `#FF6B6B`

**Background and Border:**
- Background: `#1E1E1E`
- Border radius: 12px
- Border: None
- Padding: 16px

**Labels:**
- Show metric name: ✓
- Label font size: 12px
- Label color: `#888888`
- Position: Above metric

---

## Step 12: Invert Colors for Negative Metrics

For **No Shows**, **No Show Rate**, and **Reschedules**:

1. Select the scorecard
2. Go to STYLE tab
3. Under **Comparison**:
   - Swap the positive/negative colors
   - Positive change color: `#FF6B6B` (red)
   - Negative change color: `#00D4AA` (green)

This ensures that when these metrics go DOWN, it shows green (good), and when they go UP, it shows red (bad).

---

## Step 13: Layout and Spacing

### Recommended Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Date Range Filter]  [Role Filter]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │ Booked  │ │   No    │ │ Closed  │ │   PIF   │                │
│  │  Calls  │ │  Shows  │ │   Won   │ │         │                │
│  │   125   │ │   18    │ │   52    │ │   24    │                │
│  │  ↑ 12%  │ │  ↓ 8%   │ │  ↑ 15%  │ │  ↑ 10%  │                │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                            │
│  │ Splits  │ │  Cash   │ │Renewals │                            │
│  │         │ │Collected│ │  Cash   │                            │
│  │   12    │ │$185,000 │ │ $22,500 │                            │
│  │  ↑ 5%   │ │  ↑ 18%  │ │  ↑ 8%   │                            │
│  └─────────┘ └─────────┘ └─────────┘                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │Resched- │ │No Show  │ │Show-Up  │ │ Close   │                │
│  │  ules   │ │  Rate   │ │  Rate   │ │  Rate   │                │
│  │   15    │ │ 14.40%  │ │ 85.60%  │ │ 48.60%  │                │
│  │  ↓ 10%  │ │  ↓ 5%   │ │  ↑ 5%   │ │  ↑ 12%  │                │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │ Split   │ │Cash Per │ │Cash Per │ │Monthly  │                │
│  │  Rate   │ │ Show-Up │ │   Day   │ │ Pacing  │                │
│  │ 23.08%  │ │ $1,729  │ │$26,429  │ │$792,857 │                │
│  │  ↓ 3%   │ │  ↑ 22%  │ │  ↑ 18%  │ │  ↑ 18%  │                │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Spacing Guidelines:
- Card width: ~180px each
- Card height: ~120px
- Gap between cards: 16px
- Margin from edges: 24px
- Row gap: 24px

---

## Step 14: Add Section Headers (Optional)

1. **Add → Text**
2. Create headers:
   - "Core Metrics" above top row
   - "Performance Metrics" above bottom row
3. Style:
   - Font size: 16px
   - Color: `#888888`
   - Font weight: Medium

---

## Step 15: Final Touches

### Add Dashboard Title:
1. **Add → Text**
2. Type: `Sales Performance Tracker`
3. Position at top center
4. Style:
   - Font size: 24px
   - Color: `#FFFFFF`
   - Font weight: Bold

### Add Last Updated Timestamp:
1. **Add → Text**
2. Add text with date function or static text
3. Position in top-right corner
4. Style:
   - Font size: 12px
   - Color: `#666666`

---

## Step 16: Test Your Dashboard

1. **View mode:** Click the "View" button
2. **Test date filter:** Select different date ranges
3. **Test role filter:** Filter by Closer, Setter, PCF
4. **Verify comparisons:** Check that arrows and percentages appear
5. **Verify color coding:** Ensure inverted metrics show correct colors

---

## Step 17: Share Your Dashboard

### For Viewing:
1. Click **Share** button
2. Add email addresses or get link
3. Set permission to **Viewer**

### For Editing:
1. Click **Share** button
2. Add email addresses
3. Set permission to **Editor**

### Make Public:
1. **File → Share → Get report link**
2. Change to **Anyone with the link can view**

---

## Quick Reference: Metric Formulas

| Metric | Formula |
|--------|---------|
| No Show Rate | No Shows ÷ Booked Calls |
| Show-Up Rate | 1 - (No Shows ÷ Booked Calls) |
| Close Rate | Closed Won ÷ (Booked Calls - No Shows) |
| Split Rate | Splits ÷ Closed Won |
| Cash Per Show-Up | Cash Collected ÷ (Booked Calls - No Shows) |
| Cash Per Day | Cash Collected ÷ Unique Days |
| Monthly Pacing | Cash Per Day × 30 |

---

## Next Steps

→ See **TROUBLESHOOTING.md** for common issues and solutions
