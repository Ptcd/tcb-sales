# Reassign Trials to New Activator - Instructions

## What This Does
Moves all trials, leads, and activation meetings from `merrillholdings@gmail.com` to `jennyfertan322@gmail.com`.

## Files Created
- `supabase/migrations/20250122000000_reassign_trials_to_new_activator.sql` - The migration SQL
- `scripts/verify-trial-reassignment.sql` - Verification query

## How to Run

### Option 1: Node.js Script (Easiest)
```bash
node scripts/reassign-trials-to-new-activator.js
```

### Option 2: Supabase SQL Editor (Recommended if script fails)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left sidebar
4. Click "+ New query"
5. Open the file `supabase/migrations/20250122000000_reassign_trials_to_new_activator.sql`
6. Copy the entire contents and paste into the SQL Editor
7. Click "Run"
8. You should see: `SUCCESS! Updated: X trials, X leads, X meetings`

### Option 3: Supabase CLI
If you have Supabase CLI set up:
```bash
supabase db push
```

## Verify the Results

After running the migration, run the verification query:

1. In Supabase SQL Editor, open `scripts/verify-trial-reassignment.sql`
2. Copy and paste the contents
3. Click "Run"
4. Expected results:
   - Numbers > 0 for jennyfertan rows
   - 0 for merrillholdings row

## What Gets Updated

1. **trial_pipeline.assigned_activator_id** - All trials assigned to merrillholdings
2. **search_results.assigned_to** - All active trial leads assigned to merrillholdings
3. **activation_meetings.activator_user_id** - All scheduled/rescheduled meetings

