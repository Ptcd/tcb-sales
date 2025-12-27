# Fork Guide: JCC Feature Isolation

This guide documents JCC-specific code paths that can be disabled or removed when forking this codebase for non-JCC deployments.

## Quick Disable

To disable all JCC features immediately, set the environment variable:

```bash
ENABLE_JCC_FEATURES=false
```

This will return 404 responses from all JCC API routes.

## JCC-Specific Areas

### API Routes (Protected by Feature Flag)

All of these routes check `JCC_FEATURES_ENABLED` and return 404 if disabled:

- `/api/webhooks/jcc-event` - JCC lifecycle event webhook
- `/api/webhooks/jcc-signup` - JCC signup webhook
- `/api/jcc/activation-claim` - Claim activation in JCC
- `/api/jcc/activation-queue` - Fetch activation queue from JCC
- `/api/jcc/contact-attempt` - Log contact attempt to JCC
- `/api/jcc/next-action` - Update next action in JCC
- `/api/trials/provision` - Provision JCC trial

### Database Tables

- `trial_pipeline` - Tracks trial lifecycle from JCC events
- `sdr_client_links` - Links JCC users to CRM leads
- `client_events` - Stores JCC events for sync processing

### Badge Keys (JCC-Specific)

The following badge keys are JCC-specific and can be removed:

- `trial_awaiting_activation`
- `trial_activated`
- `trial_configured`
- `trial_embed_copied`
- `trial_live_first_lead`
- `trial_stalled`

See `lib/badges.ts` for the `JCC_BADGE_KEYS` constant.

### TypeScript Types (JCC-Specific)

In `lib/types.ts`:

- `JCCActivationRecord`
- `JCCActivationStatus`
- `JCCNextActionType`
- `JCCContactResult`
- `JCCBlocker`
- `JCCChecklistItem`
- `TrialPipeline` interface
- All JCC-related request/response interfaces

### Components (JCC-Specific)

- `components/ActivationContextPanel.tsx` - Shows JCC activation context
- JCC activation mode in `components/DialerMode.tsx` (ACTIVATION mode)

### Library Files

- `lib/jcc-activation-api.ts` - JCC API client functions
- JCC-related helpers in `lib/activator-helpers.ts`

## Removal Checklist

If completely removing JCC features (not just disabling):

1. **Environment Variables**
   - Remove `JCC_WEBHOOK_SECRET`
   - Remove `JCC_PROVISION_API_KEY`
   - Remove `JCC_API_URL`

2. **Database Migrations**
   - Consider dropping `trial_pipeline` table
   - Consider dropping `sdr_client_links` table
   - Consider dropping `client_events` table
   - Remove JCC-specific columns from `search_results`:
     - `jcc_sdr_first_touch_code`
     - `jcc_sdr_last_touch_code`

3. **Code Removal**
   - Delete `/app/api/webhooks/jcc-*` directories
   - Delete `/app/api/jcc/*` directories
   - Delete `/app/api/trials/provision` directory
   - Remove JCC types from `lib/types.ts`
   - Remove JCC badge mappings from `lib/badges.ts`
   - Remove JCC components
   - Remove `lib/jcc-activation-api.ts`

4. **UI Cleanup**
   - Remove ACTIVATION mode from dialer
   - Remove activation-related UI elements
   - Remove trial pipeline views

## Notes

- The feature flag defaults to `true` (enabled) for backward compatibility
- Setting `ENABLE_JCC_FEATURES=false` is the safest way to disable without code changes
- Database tables can remain - they just won't be used if routes return 404
- Badge keys can remain in the enum - they just won't be set by JCC events


