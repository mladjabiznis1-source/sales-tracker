# Troubleshooting Guide

## Common Issues and Solutions

---

## Data Connection Issues

### Issue: "Cannot connect to Google Sheets"

**Symptoms:**
- Error message when adding data source
- Data source shows as disconnected

**Solutions:**
1. **Check sharing permissions:**
   - Open your Google Sheet
   - Click Share → Make sure Looker Studio has access
   - Try setting to "Anyone with the link can view"

2. **Re-authenticate:**
   - In Looker Studio, go to Resource → Manage added data sources
   - Click the refresh icon next to your data source
   - Re-authorize if prompted

3. **Check sheet name:**
   - Ensure the sheet tab name hasn't changed
   - Looker Studio connects to specific sheet tabs

---

### Issue: "Data not updating"

**Symptoms:**
- Dashboard shows old data
- New rows in Google Sheets don't appear

**Solutions:**
1. **Force refresh:**
   - In View mode, click the refresh icon (↻) in the toolbar
   - Or press Ctrl+Shift+E (Cmd+Shift+E on Mac)

2. **Check data freshness settings:**
   - Resource → Manage added data sources → Edit
   - Set "Data freshness" to desired interval (e.g., 15 minutes)

3. **Verify data range:**
   - If using a named range, ensure new rows are within the range
   - Better: Use entire column references (A:J) instead of fixed ranges

---

## Calculated Field Errors

### Issue: "Invalid formula" or "Error in calculated field"

**Common Causes & Fixes:**

1. **Field name mismatch:**
   ```
   ❌ Wrong: SUM(Booked_Calls)
   ✓ Correct: SUM(Booked Calls)
   ```
   Use exact field names as they appear in your data source.

2. **Missing aggregation:**
   ```
   ❌ Wrong: Booked Calls - No Shows
   ✓ Correct: SUM(Booked Calls) - SUM(No Shows)
   ```
   Wrap fields in aggregation functions (SUM, COUNT, etc.)

3. **Division by zero not handled:**
   ```
   ❌ Wrong: SUM(No Shows) / SUM(Booked Calls)
   ✓ Correct: CASE WHEN SUM(Booked Calls) = 0 THEN 0 
              ELSE SUM(No Shows) / SUM(Booked Calls) END
   ```

---

### Issue: Percentages showing as decimals

**Solution:**
1. Edit the calculated field
2. Change Type from "Number" to "Percent"
3. Or in the scorecard STYLE tab, set number format to "Percent"

---

### Issue: Currency not formatting correctly

**Solution:**
1. In data source, set field type to "Currency"
2. Select currency: USD, EUR, etc.
3. In scorecard STYLE, ensure "Compact numbers" is off for full values

---

## Comparison/Delta Issues

### Issue: "No comparison data available"

**Symptoms:**
- Comparison arrows don't appear
- Shows "No data" for comparison

**Solutions:**
1. **Enable comparison in date filter:**
   - Select your date range control
   - In DATA tab, check "Enable comparison date range"
   - Set comparison to "Previous period"

2. **Ensure sufficient historical data:**
   - If viewing "Last 7 days", you need data from 14+ days ago
   - Add more historical data to your sheet

3. **Check date field configuration:**
   - Ensure Date field is set as Date type (not Text)
   - Format should be recognizable (YYYY-MM-DD recommended)

---

### Issue: Comparison colors are wrong

**For metrics where LOWER is better (No Shows, No Show Rate, Reschedules):**

1. Select the scorecard
2. Go to STYLE tab
3. Under "Comparison":
   - Set "Positive" color to RED (#FF6B6B)
   - Set "Negative" color to GREEN (#00D4AA)

This inverts the logic so decreases show as green (good).

---

### Issue: Arrows not showing

**Solutions:**
1. In scorecard STYLE tab:
   - Find "Comparison" section
   - Enable "Show delta arrow"
   - Ensure comparison colors are set

2. Check that comparison date range is configured in DATA tab

---

## Display Issues

### Issue: Scorecards showing "null" or "No data"

**Solutions:**
1. **Check for empty cells:**
   - In Google Sheets, replace blank cells with 0
   - Never leave numeric fields empty

2. **Verify filter settings:**
   - Check if Role filter is excluding all data
   - Check if date range has no data

3. **Update calculated field:**
   ```
   CASE WHEN SUM(Booked Calls) IS NULL THEN 0 
        WHEN SUM(Booked Calls) = 0 THEN 0
        ELSE SUM(No Shows) / SUM(Booked Calls) END
   ```

---

### Issue: Numbers showing in scientific notation

**Solution:**
1. In scorecard STYLE tab
2. Under "Primary metric"
3. Uncheck "Compact numbers"
4. Set decimal places as needed

---

### Issue: Dark theme not applying

**Solutions:**
1. **For report background:**
   - Click empty canvas area
   - Theme and Layout → Customize
   - Set background color to #0D0D0D

2. **For individual components:**
   - Select each scorecard
   - STYLE tab → Background → Set to #1E1E1E

3. **For text:**
   - Select text elements
   - Set font color to #FFFFFF

---

## Filter Issues

### Issue: Role filter not working

**Solutions:**
1. **Check field binding:**
   - Select the dropdown control
   - DATA tab → Control field should be "Role"

2. **Verify data values:**
   - In Google Sheets, check Role column values
   - Must match exactly: "Closer", "Setter", "PCF"
   - Check for extra spaces or typos

3. **Enable filter for all charts:**
   - Each scorecard should use the same data source
   - Filters apply to charts using the same data source

---

### Issue: Date filter not affecting all charts

**Solution:**
1. Ensure all scorecards use the same data source
2. Check that Date field is set as the date dimension
3. In each scorecard DATA tab, verify "Date range dimension" is set to your Date field

---

## Performance Issues

### Issue: Dashboard loading slowly

**Solutions:**
1. **Reduce data volume:**
   - Archive old data to a separate sheet
   - Keep only last 12 months in active sheet

2. **Simplify calculations:**
   - Pre-calculate complex metrics in Google Sheets
   - Use simpler formulas in Looker Studio

3. **Optimize data source:**
   - Use specific column ranges instead of entire sheet
   - Remove unused columns from data source

---

### Issue: "Request timeout" errors

**Solutions:**
1. Reduce date range selection
2. Simplify calculated fields
3. Check Google Sheets for circular references
4. Try during off-peak hours

---

## Sharing Issues

### Issue: Viewers can't see data

**Solutions:**
1. **Check Google Sheets permissions:**
   - Sheet must be shared with viewers
   - Or set to "Anyone with the link can view"

2. **Check Looker Studio permissions:**
   - Report sharing settings
   - Data source credentials: "Viewer's credentials" vs "Owner's credentials"

3. **Use Owner's credentials:**
   - Resource → Manage added data sources
   - Click edit on data source
   - Set "Data credentials" to "Owner's credentials"
   - This uses your access for all viewers

---

### Issue: "You don't have access to this data source"

**Solution:**
1. The data source owner needs to share it
2. Or recreate the data source with your own Google account
3. Check if the original Google Sheet still exists

---

## Data Integrity Issues

### Issue: Numbers don't match Google Sheets

**Possible Causes:**
1. **Aggregation differences:**
   - Looker Studio might be summing when you expect average
   - Check aggregation settings in DATA tab

2. **Filter applied:**
   - Check active filters (Role, Date)
   - Clear all filters and compare

3. **Data type mismatch:**
   - Ensure numbers in Sheets are formatted as numbers, not text
   - Check for currency symbols or commas in raw data

---

### Issue: Duplicate data appearing

**Solutions:**
1. Check Google Sheets for duplicate rows
2. Verify you're not connected to multiple sheets
3. Check if data is being double-counted due to joins

---

## Quick Fixes Checklist

When something isn't working, try these in order:

1. ☐ Refresh the report (Ctrl+Shift+E)
2. ☐ Clear all filters
3. ☐ Check date range has data
4. ☐ Verify Google Sheets data is correct
5. ☐ Re-authenticate data source
6. ☐ Check field types in data source
7. ☐ Review calculated field formulas
8. ☐ Check sharing permissions
9. ☐ Try in incognito/private browser
10. ☐ Recreate the problematic component

---

## Getting Help

### Looker Studio Resources:
- [Looker Studio Help Center](https://support.google.com/looker-studio)
- [Looker Studio Community](https://support.google.com/looker-studio/community)

### Common Error Codes:
- **Error 403:** Permission denied - check sharing settings
- **Error 404:** Resource not found - sheet may be deleted
- **Error 500:** Server error - try again later

---

## Contact Support

If issues persist after trying these solutions:
1. Document the exact error message
2. Note what you were trying to do
3. Take screenshots of settings
4. Check Looker Studio status: [Google Workspace Status](https://www.google.com/appsstatus)
