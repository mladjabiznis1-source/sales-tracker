# Calculated Fields Reference

Copy-paste ready formulas for Looker Studio.

---

## How to Add Calculated Fields

1. Go to **Resource → Manage added data sources**
2. Click **Edit** on your data source
3. Click **Add a Field** (+ icon)
4. Paste the formula below
5. Set the Type as specified
6. Click **Save** then **Done**

---

## Core Calculated Fields

### 1. Show Ups
```
Name: Show Ups
Formula: SUM(Booked Calls) - SUM(No Shows)
Type: Number
```

### 2. No Show Rate
```
Name: No Show Rate
Formula: CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE SUM(No Shows) / SUM(Booked Calls) END
Type: Percent
```

### 3. Show-Up Rate
```
Name: Show-Up Rate
Formula: CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE 1 - (SUM(No Shows) / SUM(Booked Calls)) END
Type: Percent
```

### 4. Close Rate
```
Name: Close Rate
Formula: CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Closed Won) / (SUM(Booked Calls) - SUM(No Shows)) END
Type: Percent
```

### 5. Split Rate
```
Name: Split Rate
Formula: CASE WHEN SUM(Closed Won) = 0 THEN 0 ELSE SUM(Splits) / SUM(Closed Won) END
Type: Percent
```

### 6. Cash Per Show-Up
```
Name: Cash Per Show-Up
Formula: CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Cash Collected) / (SUM(Booked Calls) - SUM(No Shows)) END
Type: Currency (USD)
```

### 7. Unique Days
```
Name: Unique Days
Formula: COUNT_DISTINCT(Date)
Type: Number
```

### 8. Cash Per Day
```
Name: Cash Per Day
Formula: CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE SUM(Cash Collected) / COUNT_DISTINCT(Date) END
Type: Currency (USD)
```

### 9. Monthly Pacing
```
Name: Monthly Pacing
Formula: CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE (SUM(Cash Collected) / COUNT_DISTINCT(Date)) * 30 END
Type: Currency (USD)
```

---

## Alternative Formulas (If Above Don't Work)

Some Looker Studio versions require slightly different syntax:

### No Show Rate (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(No Shows), SUM(Booked Calls)), 0)
```

### Show-Up Rate (Alternative)
```
1 - IFNULL(SAFE_DIVIDE(SUM(No Shows), SUM(Booked Calls)), 0)
```

### Close Rate (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(Closed Won), SUM(Booked Calls) - SUM(No Shows)), 0)
```

### Split Rate (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(Splits), SUM(Closed Won)), 0)
```

### Cash Per Show-Up (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(Cash Collected), SUM(Booked Calls) - SUM(No Shows)), 0)
```

### Cash Per Day (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(Cash Collected), COUNT_DISTINCT(Date)), 0)
```

### Monthly Pacing (Alternative)
```
IFNULL(SAFE_DIVIDE(SUM(Cash Collected), COUNT_DISTINCT(Date)), 0) * 30
```

---

## Optional Advanced Fields

### Total Revenue
```
Name: Total Revenue
Formula: SUM(Cash Collected) + SUM(Renewals Cash Collected)
Type: Currency (USD)
```

### PIF Rate
```
Name: PIF Rate
Formula: CASE WHEN SUM(Closed Won) = 0 THEN 0 ELSE SUM(PIF) / SUM(Closed Won) END
Type: Percent
```

### Average Deal Size
```
Name: Average Deal Size
Formula: CASE WHEN SUM(Closed Won) = 0 THEN 0 ELSE SUM(Cash Collected) / SUM(Closed Won) END
Type: Currency (USD)
```

### Effective Show Rate (Excluding Reschedules)
```
Name: Effective Show Rate
Formula: CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE (SUM(Booked Calls) - SUM(No Shows) - SUM(Reschedules)) / SUM(Booked Calls) END
Type: Percent
```

### Weekly Pacing
```
Name: Weekly Pacing
Formula: CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE (SUM(Cash Collected) / COUNT_DISTINCT(Date)) * 7 END
Type: Currency (USD)
```

---

## Field Type Reference

| Type | Use For |
|------|---------|
| Number | Counts, quantities |
| Percent | Rates (automatically formats as %) |
| Currency (USD) | Money values |
| Text | Labels, categories |
| Date | Date fields |

---

## Troubleshooting Formulas

### "Invalid field" Error
- Check that field names match exactly (case-sensitive)
- Field names with spaces need to match: `Booked Calls` not `BookedCalls`

### "Type mismatch" Error
- Ensure you're using SUM() around numeric fields
- Don't mix aggregated and non-aggregated fields

### Formula Returns NULL
- Add IFNULL wrapper: `IFNULL(your_formula, 0)`
- Check for division by zero

### Percentage Shows as Decimal
- Change field Type to "Percent"
- Or multiply by 100 and add % in display format

---

## Quick Copy Section

All formulas in one block for easy copying:

```
-- Show Ups
SUM(Booked Calls) - SUM(No Shows)

-- No Show Rate
CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE SUM(No Shows) / SUM(Booked Calls) END

-- Show-Up Rate
CASE WHEN SUM(Booked Calls) = 0 THEN 0 ELSE 1 - (SUM(No Shows) / SUM(Booked Calls)) END

-- Close Rate
CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Closed Won) / (SUM(Booked Calls) - SUM(No Shows)) END

-- Split Rate
CASE WHEN SUM(Closed Won) = 0 THEN 0 ELSE SUM(Splits) / SUM(Closed Won) END

-- Cash Per Show-Up
CASE WHEN (SUM(Booked Calls) - SUM(No Shows)) = 0 THEN 0 ELSE SUM(Cash Collected) / (SUM(Booked Calls) - SUM(No Shows)) END

-- Unique Days
COUNT_DISTINCT(Date)

-- Cash Per Day
CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE SUM(Cash Collected) / COUNT_DISTINCT(Date) END

-- Monthly Pacing
CASE WHEN COUNT_DISTINCT(Date) = 0 THEN 0 ELSE (SUM(Cash Collected) / COUNT_DISTINCT(Date)) * 30 END
```
