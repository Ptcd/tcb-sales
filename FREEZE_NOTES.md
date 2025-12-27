# Freeze Notes - v1.0-fork-ready

**Date:** January 25, 2025  
**Tag:** v1.0-fork-ready

## What Was Hardened

This release includes three critical hardening tasks that permanently improve system quality and behavior:

### 1. Follow-Up Enforcement Gate

**Problem Solved:** Leads could previously be dispositioned or moved through statuses without a required next action, allowing silent lead abandonment.

**Implementation:**
- **Backend:** Hard validation gates in 3 API endpoints (`/api/leads/[id]/status`, `/api/leads/[id]`, `/api/calls/[id]`) requiring `next_follow_up_at` when changing status to any non-closing value
- **UI:** Validation modals in `LeadStatusDropdown` and `DialerMode` preventing status changes without follow-up dates
- **Exempt Statuses:** `closed_won`, `closed_lost`, `not_interested` (these are terminal states)

**Result:** It is now impossible to move a lead forward without either setting a next action or explicitly closing the lead.

### 2. Lost Reason Enforcement Gate

**Problem Solved:** Leads could be marked `closed_lost` without capturing why, losing valuable insight into why quotes die and SDR performance patterns.

**Implementation:**
- **Database:** Added `lost_reason` (enum) and `lost_reason_notes` (text) columns to `search_results` table
- **Backend:** Hard validation requiring `lost_reason` when status is set to `closed_lost` in all 3 API endpoints
- **UI:** Lost reason selection modals in `LeadStatusDropdown` and `DialerMode` (for `WRONG_NUMBER` outcome)
- **Lost Reason Options:** `price`, `timing`, `ghosted`, `not_a_fit`, `went_with_competitor`, `other`

**Result:** Every closed_lost lead now has a captured reason, providing permanent insight into loss patterns with zero ongoing cost.

### 3. JCC Path Isolation (Fork Hygiene)

**Problem Solved:** JCC-specific code paths were mixed throughout the codebase, making forks confusing and risky.

**Implementation:**
- **Feature Flag:** Created `lib/config.ts` with `JCC_FEATURES_ENABLED` flag (defaults to `true`, set `ENABLE_JCC_FEATURES=false` to disable)
- **API Guards:** All 7 JCC-related API routes return 404 if feature flag is disabled:
  - `/api/webhooks/jcc-event`
  - `/api/webhooks/jcc-signup`
  - `/api/jcc/activation-claim`
  - `/api/jcc/activation-queue`
  - `/api/jcc/contact-attempt`
  - `/api/jcc/next-action`
  - `/api/trials/provision`
- **Documentation:** Created `FORK_GUIDE.md` with complete JCC isolation guide
- **Code Marking:** Added `JCC_BADGE_KEYS` constant and comments marking JCC-specific badge mappings

**Result:** Forked repos can cleanly disable JCC features via environment variable, and all JCC paths are clearly documented for removal if needed.

## What's Explicitly NOT Included

This release is intentionally scoped to hardening only. The following are **NOT** included and should not be expected:

### Deal/Opportunity System
- No deal pipeline management
- No deal stages or probability tracking
- No deal value/amount fields
- No deal-to-lead conversion workflow

### Revenue Tracking
- No revenue fields on leads or deals
- No MRR/ARR calculations (except JCC-specific trial pipeline data)
- No revenue reporting or dashboards
- No revenue attribution beyond basic SDR codes

### Forecasting
- No sales forecasting models
- No pipeline value calculations
- No conversion rate predictions
- No quota tracking

### Custom Fields System
- No user-defined custom fields on leads
- No custom field types (dropdown, date, number, etc.)
- No custom field validation rules
- No custom field reporting

### Advanced Reporting
- No advanced analytics beyond basic KPIs
- No cohort analysis
- No funnel visualization (beyond basic SDR funnel)
- No custom report builder
- No data export beyond basic CSV

### Multi-Currency Support
- No currency conversion
- No multi-currency revenue tracking
- Currency assumed to be single base currency

### Advanced Workflow Automation
- No custom automation rules
- No if/then workflow builder
- No scheduled actions beyond basic follow-ups
- No integration webhooks (beyond JCC)

### Other Exclusions
- No lead scoring system
- No territory management
- No advanced permissions beyond admin/member roles
- No multi-language support
- No white-label customization

## Migration Required

Before deploying this version, run the following SQL migration:

```sql
-- Add lost_reason and lost_reason_notes columns to search_results
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lost_reason TEXT,
ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT;

COMMENT ON COLUMN search_results.lost_reason IS 'Reason why lead was lost: price, timing, ghosted, not_a_fit, went_with_competitor, other';
COMMENT ON COLUMN search_results.lost_reason_notes IS 'Optional free-text notes explaining the lost reason';
```

## Breaking Changes

### API Changes
- `PATCH /api/leads/[id]/status` now requires `nextFollowUpAt` for non-closing statuses
- `PATCH /api/leads/[id]` now requires `nextFollowUpAt` or `nextActionAt` when `leadStatus` is non-closing
- `PATCH /api/calls/[id]` now requires `nextFollowUpAt` or `nextActionAt` when outcome results in non-closing status
- All three endpoints now require `lostReason` when status/outcome is `closed_lost`

### UI Changes
- Status dropdown now shows follow-up modal for non-closing statuses
- Status dropdown now shows lost reason modal for `closed_lost`
- Dialer mode now requires follow-up for all non-closing outcomes
- Dialer mode now shows lost reason modal for `WRONG_NUMBER` outcome

## Testing Checklist

- [ ] Status change to non-closing status requires follow-up date
- [ ] Status change to `closed_lost` requires lost reason
- [ ] Call outcome that maps to non-closing status requires follow-up
- [ ] Call outcome `WRONG_NUMBER` requires lost reason
- [ ] Closing statuses (`closed_won`, `closed_lost`, `not_interested`) don't require follow-up
- [ ] JCC routes return 404 when `ENABLE_JCC_FEATURES=false`
- [ ] All existing functionality still works with new validations

## Next Steps for Fork

1. Run the SQL migration
2. Set `ENABLE_JCC_FEATURES=false` if forking for non-JCC use case
3. Review `FORK_GUIDE.md` for complete JCC isolation instructions
4. Test all validation gates work as expected
5. Deploy with confidence that leads cannot be abandoned silently


