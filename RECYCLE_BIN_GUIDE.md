# Recycle Bin Feature Guide

## Overview

The Recycle Bin feature provides a safety net for deleted items in your CRM. Instead of permanently deleting data, items are "soft deleted" and moved to the Recycle Bin where they can be restored within 30 days.

---

## What Gets Moved to Recycle Bin?

When you delete any of these items, they go to the Recycle Bin instead of being permanently deleted:

1. **Search History** - Complete search records with all their results
2. **Leads** - Individual business/lead records
3. **SMS Messages** - Sent/received text messages
4. **Email Messages** - Sent emails
5. **Call Records** - Call history entries

---

## How It Works

### Technical Implementation

**Soft Delete Pattern:**
- Instead of `DELETE FROM table`, we use `UPDATE table SET deleted_at = NOW()`
- Data stays in the database but is hidden from normal queries
- RLS (Row Level Security) policies automatically filter out deleted items

**30-Day Expiration:**
- Items deleted on **Oct 29, 2024** expire on **Nov 28, 2024**
- A database function automatically purges expired items
- Items with ≤7 days remaining show in red as a warning

---

## Using the Recycle Bin

### Accessing the Recycle Bin

Navigate to **Recycle Bin** from the main navigation menu.

### Features

1. **View All Deleted Items**
   - See all deleted items across all categories
   - Each item shows:
     - Type badge (Search, Lead, SMS, Email, Call)
     - Title and subtitle
     - Deletion date
     - Days remaining (before permanent deletion)

2. **Search & Filter**
   - Search by title or content
   - Filter by item type (All, Search History, Leads, SMS, Email, Calls)

3. **Restore Items**
   - Click the **"Restore"** button to recover an item
   - Item immediately returns to its original location
   - Search histories restore with all associated results

4. **Permanent Delete**
   - Click **"Delete"** button for permanent removal
   - Requires confirmation (cannot be undone)
   - Useful for cleaning up items you're certain you don't need

5. **Empty Recycle Bin**
   - **"Empty Recycle Bin"** button (top-right)
   - Permanently deletes ALL items in the bin
   - Requires double confirmation for safety

---

## Database Setup

### 1. Run the Migration

Execute the migration in your Supabase SQL Editor:

```bash
# The migration file is located at:
supabase/migrations/20241105000001_add_recycle_bin_support.sql
```

Or in Supabase Dashboard:
1. Go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents of `20241105000001_add_recycle_bin_support.sql`
4. Click **"Run"**

### What the Migration Does

1. **Adds `deleted_at` columns** to all relevant tables
2. **Creates indexes** for fast queries on deleted items
3. **Updates RLS policies** to:
   - Hide deleted items from normal queries (`WHERE deleted_at IS NULL`)
   - Allow viewing deleted items separately (`WHERE deleted_at IS NOT NULL`)
4. **Creates cleanup function** to auto-delete items after 30 days

### 2. Optional: Schedule Auto-Cleanup

To automatically remove expired items, you can set up a scheduled job:

**Option A: Supabase Edge Function (Recommended)**
```sql
-- Create a scheduled edge function that runs daily
-- In your Supabase project, create an Edge Function:

// supabase/functions/cleanup-recycle-bin/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data, error } = await supabaseClient.rpc('cleanup_expired_deleted_items')

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Then schedule it in Supabase Dashboard → Database → Cron Jobs:
```sql
SELECT cron.schedule(
  'cleanup-recycle-bin',
  '0 2 * * *', -- Run at 2 AM daily
  'SELECT cleanup_expired_deleted_items()'
);
```

**Option B: Manual Cleanup**

Run this SQL command periodically (e.g., monthly):
```sql
SELECT * FROM cleanup_expired_deleted_items();
```

This will return counts of items deleted from each table.

---

## API Endpoints

### GET `/api/recycle-bin`
Fetches all deleted items for the current organization.

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "type": "lead",
      "title": "ASI Auto Wreckers",
      "subtitle": "+639661983617",
      "deleted_at": "2024-10-29T12:00:00Z",
      "daysRemaining": 25
    }
  ],
  "count": 1
}
```

### POST `/api/recycle-bin/restore`
Restores a deleted item.

**Request:**
```json
{
  "id": "uuid",
  "type": "lead"
}
```

### DELETE `/api/recycle-bin/permanent`
Permanently deletes an item (cannot be undone).

**Request:**
```json
{
  "id": "uuid",
  "type": "sms"
}
```

### DELETE `/api/recycle-bin/empty`
Permanently deletes ALL items in the recycle bin.

---

## User Experience Changes

### When Deleting Items

**Before:**
- "Search history deleted successfully" ❌ (Gone forever)

**Now:**
- "Search history moved to recycle bin" ✅ (Can be recovered)

### Delete Buttons

All delete operations now soft delete by default:
- Search History page → Delete button
- SMS History page → Delete button
- Email History page → Delete button
- Call History page → Delete button
- Individual leads → Delete button (via API)

---

## Benefits

✅ **Accident Protection** - Recover from accidental deletions  
✅ **30-Day Safety Net** - Plenty of time to restore items  
✅ **Easy Recovery** - One-click restore  
✅ **Automatic Cleanup** - No manual maintenance needed  
✅ **Organization-Wide** - All team members see the same recycle bin  
✅ **Audit Trail** - Track when items were deleted  
✅ **Storage Efficient** - Auto-deletes after 30 days  

---

## Testing Checklist

Before deploying to production, test these scenarios:

### 1. Soft Delete Operations
- [ ] Delete a search history → Verify it's hidden from search history page
- [ ] Delete an individual lead → Verify it's hidden from results
- [ ] Delete an SMS message → Verify it's hidden from SMS history
- [ ] Delete an email → Verify it's hidden from email history
- [ ] Delete a call record → Verify it's hidden from call history

### 2. Recycle Bin Viewing
- [ ] Open Recycle Bin → See all deleted items
- [ ] Verify days remaining calculation is correct
- [ ] Search for items by name
- [ ] Filter by item type

### 3. Restore Operations
- [ ] Restore a search history → Verify it reappears with all results
- [ ] Restore a lead → Verify it reappears in search results
- [ ] Restore an SMS → Verify it reappears in SMS history
- [ ] Restore an email → Verify it reappears in email history
- [ ] Restore a call → Verify it reappears in call history

### 4. Permanent Delete
- [ ] Permanently delete an item → Confirm it's gone from database
- [ ] Try to restore a permanently deleted item → Should fail

### 5. Empty Recycle Bin
- [ ] Delete multiple items
- [ ] Click "Empty Recycle Bin"
- [ ] Confirm double prompt appears
- [ ] Verify all items are permanently deleted

### 6. Organization Isolation
- [ ] User in Org A deletes item
- [ ] User in Org B should NOT see it in their recycle bin
- [ ] RLS ensures privacy

### 7. Auto-Cleanup (Optional)
- [ ] Manually set `deleted_at` to 31+ days ago
- [ ] Run `SELECT * FROM cleanup_expired_deleted_items();`
- [ ] Verify old items are permanently deleted

---

## Troubleshooting

### Items Not Appearing in Recycle Bin

**Check RLS Policies:**
```sql
-- Run in Supabase SQL Editor
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('search_history', 'search_results', 'sms_messages', 'email_messages', 'calls')
  AND qual LIKE '%deleted_at%';
```

You should see policies for both:
- `deleted_at IS NULL` (normal queries)
- `deleted_at IS NOT NULL` (recycle bin queries)

### Cannot Restore Items

**Verify Organization ID:**
```sql
-- Check if item belongs to your organization
SELECT id, organization_id, deleted_at
FROM search_history
WHERE id = 'YOUR_ITEM_ID';
```

If `organization_id` doesn't match, you don't have permission to restore it.

### Restore Button Not Working

Check browser console for errors. Common issues:
- Network error (API endpoint not responding)
- RLS permission denied (user not in same organization)
- Item already restored (already has `deleted_at = NULL`)

---

## Security Considerations

1. **RLS Protection**: Users can only see/restore items from their own organization
2. **Double Confirmation**: Empty Recycle Bin requires two confirmations
3. **Audit Trail**: `deleted_at` timestamp provides deletion history
4. **Service Role Only**: Auto-cleanup function requires elevated privileges

---

## Future Enhancements

Potential improvements for future versions:

1. **Deletion Reason**: Add `deletion_reason` column to track why items were deleted
2. **Bulk Restore**: Select multiple items and restore at once
3. **Email Notifications**: Alert users before items are permanently deleted
4. **Customizable Retention**: Allow admins to set retention period (default 30 days)
5. **Trash Analytics**: Dashboard showing deletion patterns and statistics

---

## Summary

The Recycle Bin feature provides a safety net for all deletion operations in the CRM. Items are preserved for 30 days, allowing ample time for recovery. The implementation uses industry-standard soft delete patterns with efficient database indexing and automatic cleanup.

**Key Points:**
- ✅ All deletes are now soft deletes
- ✅ 30-day retention period
- ✅ One-click restore
- ✅ Automatic cleanup
- ✅ Organization-wide access
- ✅ No impact on existing functionality

Happy restoring! 🗑️➡️✨

