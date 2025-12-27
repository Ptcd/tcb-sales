<!-- fa9f06ba-7803-4bcc-b428-255ac915038f ce3d2f26-ef12-42df-831c-7810cc859b4a -->
# Sync JCC Trials to CRM Activations

## Overview

Pull all active trials from the JCC system and import them into the CRM so they appear on the Activations page. Also ensure when someone becomes activator, all trials get assigned to them.

---

## Part 1: One-Time Sync Script

### File to Create: `scripts/sync-jcc-trials.js`

### Step-by-Step Logic:

```
1. Load environment variables (dotenv)
2. Initialize Supabase client with service role key
3. Call JCC API to get all clients
4. Filter for trials (subscription_status === 'trial' OR trial_end > now)
5. For each trial user:
   a. Try to find existing lead by email (case-insensitive)
   b. If no match, create new lead
   c. Set badge_key = 'trial_awaiting_activation'
   d. Add to JCC campaign (campaign_leads table)
   e. Create trial_pipeline entry
   f. Create sdr_client_links entry
   g. Assign to activator (if one exists)
6. Log summary of what was synced
```

### JCC API Call:

```javascript
const response = await fetch('https://app.autosalvageautomation.com/api/control-tower/clients', {
  headers: {
    'Authorization': `Bearer ${process.env.JCC_ADMIN_TOKEN}`
  }
});
const clients = await response.json();
```

### Expected JCC Response Fields:

```javascript
{
  id: "uuid",                    // JCC user ID -> use for jcc_user_id
  email: "user@example.com",     // Match leads by this
  subscription_status: "trial",  // Filter where this === "trial"
  trial_end: "2025-01-15",       // Or where this > today
  plan_tier: "trial",
  signupDate: "2025-12-15",      // Use for trial_started_at
  credits_remaining: 20,
  business_name: "Joe's Junk",   // Use for lead name if creating
  phone: "555-1234"              // Optional
}
```

### Filter Logic:

```javascript
const trials = clients.filter(c => 
  c.subscription_status === 'trial' || 
  (c.trial_end && new Date(c.trial_end) > new Date())
);
```

### Database Operations for Each Trial:

**Step A - Find or create lead:**

```javascript
// Try to find by email
const { data: existingLead } = await supabase
  .from('search_results')
  .select('id')
  .ilike('email', trialUser.email)
  .single();

// If not found, create new lead
if (!existingLead) {
  // Need search_history_id - find or create "JCC Sync" placeholder
  const { data: syncHistory } = await supabase
    .from('search_history')
    .select('id')
    .eq('keyword', 'JCC Sync')
    .single();
  
  // Create lead
  const { data: newLead } = await supabase
    .from('search_results')
    .insert({
      search_history_id: syncHistory.id,
      name: trialUser.business_name || trialUser.email.split('@')[0],
      email: trialUser.email.toLowerCase(),
      phone: trialUser.phone || null,
      address: 'Imported from JCC',
      place_id: `jcc_sync_${trialUser.id}`,
      lead_source: 'jcc_signup',
      lead_status: 'new',
      client_status: 'trialing',
      badge_key: 'trial_awaiting_activation',
      organization_id: jccCampaign.organization_id
    })
    .select('id')
    .single();
}
```

**Step B - Add to JCC campaign:**

```javascript
// Get JCC campaign
const { data: jccCampaign } = await supabase
  .from('campaigns')
  .select('id, organization_id')
  .eq('name', 'Junk Car Calculator')
  .single();

// Upsert into campaign_leads
await supabase
  .from('campaign_leads')
  .upsert({
    campaign_id: jccCampaign.id,
    lead_id: leadId,
    organization_id: jccCampaign.organization_id,
    status: 'available'
  }, { onConflict: 'campaign_id,lead_id' });
```

**Step C - Create trial_pipeline:**

```javascript
await supabase
  .from('trial_pipeline')
  .upsert({
    crm_lead_id: leadId,
    jcc_user_id: trialUser.id,
    trial_started_at: trialUser.signupDate || new Date().toISOString(),
    trial_ends_at: trialUser.trial_end || null,
    bonus_state: 'none'
  }, { onConflict: 'crm_lead_id' });
```

**Step D - Create sdr_client_links:**

```javascript
await supabase
  .from('sdr_client_links')
  .upsert({
    user_id: trialUser.id,  // JCC user ID
    crm_lead_id: leadId
  }, { onConflict: 'user_id,crm_lead_id' });
```

**Step E - Assign to activator:**

```javascript
// Find activator for org
const { data: activator } = await supabase
  .from('user_profiles')
  .select('id')
  .eq('organization_id', jccCampaign.organization_id)
  .eq('is_activator', true)
  .single();

if (activator) {
  await supabase
    .from('search_results')
    .update({ assigned_to: activator.id })
    .eq('id', leadId);
}
```

### Run Command:

```bash
node scripts/sync-jcc-trials.js
```

---

## Part 2: Auto-Assign Trials When Activator is Set

### File to Modify: `app/api/team/members/[id]/activator/route.ts`

### Current Code (line 40-43):

```typescript
const { error } = await serviceSupabase
  .from("user_profiles")
  .update({ is_activator: is_activator })
  .eq("id", targetUserId);
```

### Add After Line 43 (after updating is_activator):

```typescript
// If setting someone as activator, assign all unassigned trials to them
if (is_activator) {
  // Get JCC campaign
  const { data: jccCampaign } = await serviceSupabase
    .from("campaigns")
    .select("id")
    .eq("name", "Junk Car Calculator")
    .single();

  if (jccCampaign) {
    // Get all lead IDs in JCC campaign
    const { data: campaignLeads } = await serviceSupabase
      .from("campaign_leads")
      .select("lead_id")
      .eq("campaign_id", jccCampaign.id);

    const leadIds = campaignLeads?.map(cl => cl.lead_id) || [];

    if (leadIds.length > 0) {
      // Update all trial leads that are unassigned or not assigned to this activator
      const { data: updated, error: assignError } = await serviceSupabase
        .from("search_results")
        .update({ 
          assigned_to: targetUserId,
          updated_at: new Date().toISOString()
        })
        .in("id", leadIds)
        .in("badge_key", [
          "trial_awaiting_activation",
          "trial_activated", 
          "trial_configured",
          "trial_embed_copied",
          "trial_live_first_lead"
        ])
        .is("assigned_to", null)
        .select("id");

      console.log(`Assigned ${updated?.length || 0} trials to new activator ${targetUserId}`);
    }
  }
}
```

---

## Environment Variable Needed

Add to `.env.local`:

```
JCC_ADMIN_TOKEN=<the admin bearer token for JCC control tower API>
```

---

## Summary of Changes

| File | Action |

|------|--------|

| `scripts/sync-jcc-trials.js` | CREATE - One-time sync script |

| `app/api/team/members/[id]/activator/route.ts` | MODIFY - Add auto-assign logic after line 43 |

| `.env.local` | ADD - `JCC_ADMIN_TOKEN` variable |

### To-dos

- [ ] Create one-time sync script to pull JCC trials and import to CRM
- [ ] Update activator assignment to auto-route all unassigned trials