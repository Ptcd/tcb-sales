<!-- f6667eee-ac20-41e8-8ee6-bad9a4993059 06ef73d4-9d30-483a-9bbd-0007c0dd3ea1 -->
# Campaign Template Management

## Changes - COMPLETED ✅

### 1. Add Templates Section to Campaign Edit Page ✅

Updated `app/dashboard/admin/campaigns/[id]/edit/page.tsx`:

- Added a new "Templates" section below the existing settings
- Shows two tabs: "Email Templates" and "SMS Templates"
- Lists existing templates with edit/delete buttons
- Includes "Create Template" button for each type
- Has inline create/edit forms

### 2. Update API Permissions ✅

Updated template API routes to check for admin or campaign manager role:

- `app/api/email/templates/route.ts` - POST (create) - uses `canManageTemplates` helper
- `app/api/email/templates/[id]/route.ts` - PATCH, DELETE - uses `canManageTemplate` helper
- `app/api/sms/templates/route.ts` - POST (create) - uses `canManageTemplates` helper
- `app/api/sms/templates/[id]/route.ts` - PUT, DELETE - uses `canManageTemplate` helper

Created `lib/utils/templatePermissions.ts` helper with:
- `canManageTemplates()` - checks if user can create templates for a campaign
- `canManageTemplate()` - checks if user can edit/delete a specific template

### 3. Update Database RLS Policies ✅

Created migration `supabase/migrations/20250609100000_template_manager_permissions.sql`:

- Updated INSERT/UPDATE/DELETE policies for `email_templates` and `sms_templates`
- Only organization admins and campaign managers (role='manager' in campaign_members) can modify templates
- Regular campaign members can still SELECT (read/use) templates

### 4. Hide Management UI for Non-Managers ✅

Updated `components/SMSPanel.tsx`:
- Removed the "Manage templates" (Settings) button from the SMS panel header
- Removed the TemplateManagement modal import and usage
- Users now manage templates through the Campaign edit page instead

## Who Can Manage Templates

| User Role | Can View/Use Templates | Can Create/Edit/Delete Templates |
|-----------|----------------------|--------------------------------|
| Admin | ✅ All in organization | ✅ All in organization |
| Campaign Manager | ✅ In their campaigns | ✅ In campaigns they manage |
| Regular Member | ✅ In their campaigns | ❌ Read-only |

## To-dos - COMPLETED

- [x] Create /dashboard/admin/campaigns/new/page.tsx with full-width form
- [x] Create /dashboard/admin/campaigns/[id]/edit/page.tsx
- [x] Update campaigns list page to use navigation instead of modal
- [x] Add Templates section to campaign edit page with create/edit/delete UI
- [x] Update template APIs to check admin/manager role before allowing edits
- [x] Update RLS policies to restrict template edits to admins/managers
- [x] Hide template management buttons in SMS/Email panels for regular users



