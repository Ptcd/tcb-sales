# Testing Checklist - Team Management Feature

After merging `feature/team-management` to `main`, please test all features to ensure nothing broke.

## ✅ Prerequisites

1. **Run all migrations in Supabase SQL Editor** (in order):
   - `20241031000000_create_team_system.sql`
   - `20241031000001_fix_invitation_signup_trigger.sql`
   - `20241031000002_add_email_to_user_profiles.sql`
   - `20241031000003_add_delete_policy_for_user_profiles.sql`
   - `20241031000004_add_delete_member_function.sql`
   - `20241031000006_auto_accept_invitations_in_trigger.sql` (optional - auto-accepts on signup)
   - `20241031000009_fix_invitation_acceptance_with_bypass.sql` (for Force Accept button)
   - `20241031000010_add_update_role_function.sql` (for role updates)

2. **Verify deployment** - Check Vercel deployment is successful

---

## 🧪 Feature Testing

### 1. Authentication & Login ✅
- [ ] Login page - email and password fields work
- [ ] Signup page - works correctly
- [ ] Email confirmation flow (if enabled)
- [ ] Password reset (if implemented)

### 2. Team Management 🔥 (NEW)
- [ ] Settings page accessible from navigation
- [ ] View team members list
- [ ] Invite new member - sends invitation email
- [ ] Force Accept button works for pending invitations
- [ ] Change member role (Member ↔ Admin)
- [ ] Remove team member
- [ ] Verify removed member no longer has access

### 3. Google Maps Search 🔍
- [ ] Search functionality works
- [ ] Results display correctly
- [ ] Search history saves
- [ ] Results are visible to all team members (organization-wide)

### 4. SMS Functionality 📱
- [ ] Send SMS to lead
- [ ] SMS history displays
- [ ] SMS history visible to all team members
- [ ] SMS appears in activity timeline

### 5. Voice Calls ☎️
- [ ] Initiate voice call
- [ ] Call connects properly
- [ ] Call history displays
- [ ] Call duration records correctly
- [ ] Call outcome can be edited
- [ ] Call notes can be added
- [ ] Calls visible to all team members

### 6. Email System 📧
- [ ] Send email to lead
- [ ] Email templates work
- [ ] Create/edit email templates
- [ ] Email history displays
- [ ] Reply-To email works
- [ ] Emails visible to all team members

### 7. Data Sharing 👥
- [ ] Lead searches visible to all team members
- [ ] SMS messages visible to all team members
- [ ] Calls visible to all team members
- [ ] Emails visible to all team members
- [ ] Activity timeline shows all team activities

### 8. Phone Numbers 📞
- [ ] View Twilio phone numbers
- [ ] Add new phone number
- [ ] Delete phone number
- [ ] Numbers visible to all team members

---

## 🐛 Known Issues & Workarounds

### Invitation Acceptance
- **Issue**: Auto-accept removed for simplicity
- **Workaround**: Use "Force Accept" button in Settings for pending invitations

### Role Updates
- **Issue**: Requires database function to bypass RLS
- **Fix**: Run migration `20241031000010_add_update_role_function.sql`

---

## 🚨 Critical Checks

1. **Login works** ✅ (Already confirmed)
2. **No data loss** - Verify existing leads/SMS/calls are still accessible
3. **Multi-user access** - Test with 2+ users in same organization
4. **RLS policies** - Verify users can only see their organization's data

---

## 📝 Migration Checklist

Run these in Supabase SQL Editor in order:

```
[ ] 20241031000000_create_team_system.sql
[ ] 20241031000001_fix_invitation_signup_trigger.sql
[ ] 20241031000002_add_email_to_user_profiles.sql
[ ] 20241031000003_add_delete_policy_for_user_profiles.sql
[ ] 20241031000004_add_delete_member_function.sql
[ ] 20241031000009_fix_invitation_acceptance_with_bypass.sql
[ ] 20241031000010_add_update_role_function.sql
```

Optional (for auto-accept on signup):
```
[ ] 20241031000006_auto_accept_invitations_in_trigger.sql
```

---

## ✅ Sign-off

- [ ] All tests passed
- [ ] No data loss detected
- [ ] Team management working
- [ ] All existing features working
- [ ] Ready for production

