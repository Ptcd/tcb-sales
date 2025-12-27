# Trial Count Discrepancy Investigation - Danilo

**Date Range:** December 15-20, 2025  
**SDR:** Danilo (pantot22@gmail.com)  
**Investigation Date:** December 21, 2025

## Executive Summary

After investigating the discrepancy between the dashboard (showing 7 trials) and the weekly email report (showing 17 trials), we found that **Danilo actually had 7 trials** during this period. The weekly email report was incorrect due to summing up daily summaries that contained duplicate/inflated counts.

## Findings

### Data Source Comparison

| Data Source | Count | Notes |
|------------|-------|-------|
| **lead_notifications (unique)** | **7** | ✅ Deduplicated by lead_id - matches calls |
| **lead_notifications (total events)** | 19 | Contains duplicates (same lead, multiple webhooks) |
| **calls table** | **7** | ✅ Matches unique lead_notifications count |
| **daily_sdr_summaries (sum)** | 17 | ❌ Inflated - contains duplicates |

### Root Cause

1. **Multiple webhooks per trial**: The JCC system sent multiple `trial_started` webhooks for the same lead (likely due to retries or system issues). This resulted in 19 total events for only 7 unique leads.

2. **Daily summaries stored duplicates**: The `daily_sdr_summaries` table stored trial counts that included duplicates. When these were summed for the weekly report, it showed 17 trials instead of the actual 7.

3. **Dashboard is correct**: The dashboard correctly shows 7 trials because it uses the `calls` table, which only has one record per call.

### The 7 Actual Trials

1. Heritage Used Car & Truck Parts LLC (freight@heritageautoparts.com) - Dec 15
2. Crazy Kenny's Junk Cars (crazykennyjunkcars@gmail.com) - Dec 15
3. B & M Auto Salvage (mjmsalvage@yahoo.com) - Dec 15
4. JD'S Cheap Tow (jdcheaptow@yahoo.com) - Dec 16
5. Henry's Auto Paint And Salvage Cars (usedgoods32@aol.com) - Dec 16
6. Nicholas Scrap Metal Inc (nicholasscrapmetalinc@yahoo.com) - Dec 18
7. 786 Quick Tow (786quicktow@gmail.com) - Dec 19

## Recommendations

### Immediate Actions

1. ✅ **Trust the dashboard count (7 trials)** - This is the accurate number
2. ✅ **The weekly email report was incorrect** - It summed up daily summaries that contained duplicates
3. ✅ **Both data sources (calls table and deduplicated lead_notifications) agree on 7 trials**

### Long-term Fixes

1. **Fix daily summary generation**: Ensure `computeJCCMetrics` is always used when generating daily summaries (it already deduplicates properly)

2. **Add deduplication to weekly aggregation**: The `computeWeeklyMetrics` function should verify that daily summaries don't contain duplicates, or recalculate from source data

3. **Consider using lead_notifications as primary source**: Since this receives webhooks directly from JCC, it's the most authoritative source. The dashboard could query this table instead of the calls table for trial counts.

4. **Investigate duplicate webhooks**: Work with the JCC team to understand why multiple `trial_started` webhooks are being sent for the same lead. This could indicate a bug in their webhook system.

## Technical Details

### How the Discrepancy Occurred

1. JCC sent 19 `trial_started` webhooks for 7 unique leads (duplicates)
2. Daily summaries were generated and stored with inflated counts (likely before deduplication logic was added, or during data restoration)
3. Weekly summary summed the daily summaries: 9 + 6 + 1 + 1 = 17
4. Dashboard correctly shows 7 (from calls table)

### Code References

- **Dashboard trial count**: `app/api/admin/sdr-performance/route.ts` - counts from `calls` table
- **Weekly email trial count**: `app/api/cron/generate-weekly-summaries/route.ts` - sums from `daily_sdr_summaries`
- **Daily summary generation**: `app/api/cron/generate-daily-summaries/route.ts` - uses `computeJCCMetrics` which deduplicates
- **Deduplication logic**: `lib/utils/sdrMetrics.ts` - `computeJCCMetrics` function deduplicates by lead_id

## Conclusion

**The truth: Danilo had 7 trials during Dec 15-20, 2025.**

The dashboard is showing the correct number. The weekly email report was incorrect due to summing daily summaries that contained duplicate counts. The data loss/restoration incident likely contributed to this by restoring daily summaries that were calculated before proper deduplication was implemented.


