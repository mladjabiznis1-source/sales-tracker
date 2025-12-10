# Google Sheets Setup Guide

## Step 1: Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **+ Blank** to create a new spreadsheet
3. Name it: `Sales Performance Tracker - Data`

---

## Step 2: Import Sample Data

1. In your new sheet, go to **File → Import**
2. Click **Upload** tab
3. Drag and drop the `sales_data_template.csv` file
4. Select **Replace current sheet**
5. Click **Import data**

---

## Step 3: Sheet Structure

Your sheet should have these columns in Row 1 (headers):

| Column | Header | Data Type | Format |
|--------|--------|-----------|--------|
| A | Date | Date | YYYY-MM-DD |
| B | Role | Text | Closer, Setter, PCF |
| C | Booked Calls | Number | Integer |
| D | No Shows | Number | Integer |
| E | Closed Won | Number | Integer |
| F | PIF | Number | Integer |
| G | Splits | Number | Integer |
| H | Cash Collected | Currency | $#,##0.00 |
| I | Renewals Cash Collected | Currency | $#,##0.00 |
| J | Reschedules | Number | Integer |

---

## Step 4: Add Calculated Columns (Optional - For Sheet Reference)

Add these formulas in columns K-Q for Row 2 (copy down for all rows):

### Column K: No Show Rate
**Header:** `No Show Rate`
**Formula (K2):**
```
=IF(C2=0, 0, D2/C2)
```

### Column L: Show-Up Rate
**Header:** `Show-Up Rate`
**Formula (L2):**
```
=IF(C2=0, 0, 1-(D2/C2))
```

### Column M: Close Rate
**Header:** `Close Rate`
**Formula (M2):**
```
=IF((C2-D2)=0, 0, E2/(C2-D2))
```

### Column N: Split Rate
**Header:** `Split Rate`
**Formula (N2):**
```
=IF(E2=0, 0, G2/E2)
```

### Column O: Cash Per Show-Up
**Header:** `Cash Per Show-Up`
**Formula (O2):**
```
=IF((C2-D2)=0, 0, H2/(C2-D2))
```

---

## Step 5: Format Your Sheet

### Date Column (A):
1. Select column A (excluding header)
2. **Format → Number → Date**

### Currency Columns (H, I, O):
1. Select columns H, I, and O
2. **Format → Number → Currency**

### Percentage Columns (K, L, M, N):
1. Select columns K, L, M, N
2. **Format → Number → Percent**
3. Click **Decrease decimal places** to show 2 decimals

---

## Step 6: Create Data Validation for Role

1. Select column B (excluding header)
2. **Data → Data validation**
3. Click **Add rule**
4. Criteria: **Dropdown (from a list)**
5. Enter: `Closer, Setter, PCF`
6. Click **Done**

---

## Step 7: Name Your Data Range (Important for Looker Studio)

1. Select all your data including headers (A1 to last row/column)
2. **Data → Named ranges**
3. Click **+ Add a range**
4. Name it: `SalesData`
5. Click **Done**

---

## Step 8: Enable Auto-Refresh

1. Go to **File → Settings**
2. Under **Calculation**, set recalculation to **On change and every minute**
3. Click **Save settings**

---

## Step 9: Share Settings for Looker Studio

1. Click **Share** button (top right)
2. Under **General access**, select:
   - **Anyone with the link** (if sharing dashboard publicly)
   - OR keep **Restricted** and add specific users
3. Set permission to **Viewer** minimum
4. Click **Done**

---

## Data Entry Guidelines

### Adding New Data:
1. Always add new rows at the bottom
2. Use date format: YYYY-MM-DD (e.g., 2024-12-08)
3. Role must be exactly: `Closer`, `Setter`, or `PCF`
4. Enter 0 for any metrics with no activity (don't leave blank)
5. Currency values don't need $ symbol

### Example Row:
```
2024-12-08 | Closer | 15 | 2 | 8 | 3 | 2 | 24500 | 3200 | 1
```

---

## Quick Reference: Column Definitions

| Metric | Description |
|--------|-------------|
| **Booked Calls** | Total calls scheduled for the day |
| **No Shows** | Calls where prospect didn't show up |
| **Closed Won** | Successful sales closed |
| **PIF** | Paid In Full deals |
| **Splits** | Deals split with another rep |
| **Cash Collected** | Total revenue from new sales |
| **Renewals Cash Collected** | Revenue from renewal customers |
| **Reschedules** | Calls that were rescheduled |

---

## Next Steps

Once your Google Sheet is set up, proceed to:
→ **LOOKER_STUDIO_SETUP.md** for dashboard creation
