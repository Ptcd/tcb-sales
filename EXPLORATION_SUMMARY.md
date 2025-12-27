# 🔍 Codebase Exploration Summary

**Date:** December 9, 2025  
**Explored By:** Ernie  
**Context:** Colin's Task Assignment

---

## 📊 System Overview

This is a **full-featured CRM and Sales Outreach Platform** for Auto Salvage Automation, far beyond its original "Google Maps Dashboard" roots. It combines lead generation, multi-channel outreach (SMS, Email, Voice), campaign management, and performance analytics.

### Tech Stack
- **Framework:** Next.js 16.0.7 (App Router) with React 19.1.2
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Telephony:** Twilio (SMS, Voice, WebRTC)
- **Email:** Brevo (sending) + Mailgun (inbound routing)
- **Deployment:** Vercel

---

## 🏗️ System Architecture

### **User Hierarchy**
```
Organization
  ├── Admins (full access)
  └── Members/SDRs (limited to assigned campaigns/leads)
```

### **Campaign-Based Workflow** (New!)
- Users work within **campaigns** (silos)
- Each campaign has:
  - Members (SDRs assigned to it)
  - Leads (linked to campaign)
  - Email settings (from name, signature)
  - Lead filters (min rating, requires phone/email, etc.)
- Leads can be "claimed" by users within campaigns
- Reports/performance can be filtered by campaign

### **Lead Lifecycle**
```
Google Maps Search → Deduplication → Assignment → Campaign → Outreach → Conversion
                    ↓
                Email Scraping (if enabled)
```

---

## 🎯 Key Features

### 1. **Lead Generation & Management**
- **Google Maps Search:** Find businesses by keyword + location
- **Email Scraping:** Automatically scrape emails from business websites
- **Manual Lead Entry:** Add leads directly
- **Deduplication:** Prevents duplicate leads via phone number matching
- **Campaign Assignment:** Leads belong to campaigns
- **Status Tracking:** New → Contacted → Qualified → Converted → etc.
- **Recycle Bin:** Soft delete leads

**Key Files:**
- `app/dashboard/page.tsx` - Main search interface
- `app/api/search/route.ts` - Google Places API integration
- `app/api/scrape-emails/route.ts` - Email scraping
- `app/dashboard/leads/page.tsx` - Lead management
- `lib/utils/leadDeduplication.ts` - Phone matching logic

### 2. **Multi-Channel Messaging**

#### **SMS System**
- Bulk SMS to selected leads
- Templates with personalization (`{{name}}`, `{{address}}`)
- Twilio integration with Messaging Service
- User-specific phone number assignment (new!)
- Delivery status tracking

**Key Files:**
- `components/SMSPanel.tsx` - Bulk SMS UI
- `app/api/sms/send/route.ts` - Send endpoint
- `app/dashboard/sms-history/page.tsx` - SMS history

#### **Email System**
- Brevo for outbound emails
- Mailgun for inbound routing
- Template system with HTML editor
- Variable substitution
- Scheduled sending
- Campaign-specific from addresses (new!)
- Threading support

**Key Files:**
- `components/EmailPanel.tsx` - Bulk email UI
- `components/QuickEmailModal.tsx` - Single email
- `app/api/email/send/route.ts` - Send endpoint
- `app/api/email/inbound/route.ts` - Mailgun webhook

#### **Voice/Calling System**
- WebRTC softphone (in-browser calling)
- Live call forwarding
- Voicemail drop
- Inbound call routing
- Call recording
- Call queue for reps
- User-assigned caller IDs (new!)

**Key Files:**
- `components/Softphone.tsx` - WebRTC interface
- `components/CallOptionsModal.tsx` - Call initiation
- `app/api/calls/initiate/route.ts` - Start calls
- `app/api/twilio/voice/*` - Twilio webhooks
- `app/dashboard/call-queue/page.tsx` - Rep call queue

### 3. **Conversations System**
- Unified inbox for SMS/Email threads
- Per-lead conversation history
- Real-time message updates
- Support for phone-only conversations (non-CRM contacts)

**Key Files:**
- `app/dashboard/conversations/page.tsx` - Conversation UI
- `app/api/conversations/[leadId]/route.ts` - Send messages

### 4. **Campaign Management** (New!)
- Create/edit/archive campaigns
- Assign members to campaigns
- Import leads into campaigns
- Claim/release leads within campaigns
- Campaign-specific email settings
- Lead filters per campaign

**Key Files:**
- `app/dashboard/admin/campaigns/page.tsx` - Campaign manager
- `app/api/campaigns/route.ts` - Campaign CRUD
- `supabase/migrations/20250118000000_create_campaign_system.sql` - DB schema

### 5. **SDR Tracking System** (New!)
- Each SDR gets a unique tracking code (e.g., `thalia`, `john-doe`)
- Generates personalized signup links:
  - `https://autosalvageautomation.com/try-the-calculator?sdr=thalia`
- When leads sign up via JCC (Junk Car Calculator), they're auto-assigned to that SDR
- Webhook integration for attribution

**Key Files:**
- `app/dashboard/settings/page.tsx` (lines 64-238) - SDR code management
- `app/api/webhooks/jcc-signup/route.ts` - Webhook handler
- `supabase/migrations/20250609000002_add_sdr_tracking_code.sql` - DB column

**How it works:**
1. SDR sets their code in Settings (e.g., `thalia`)
2. System generates: `https://autosalvageautomation.com/try-the-calculator?sdr=thalia`
3. SDR shares link with leads via SMS/Email/etc.
4. Lead clicks and signs up
5. JCC webhook fires to `/api/webhooks/jcc-signup`
6. Lead is auto-assigned to SDR with `thalia` code

### 6. **Performance & Reporting**
- Agent performance metrics (calls, SMS, emails, conversions)
- Conversion funnel analytics
- Daily/weekly summaries
- KPI dashboards
- Campaign-filtered reports (new!)

**Key Files:**
- `app/dashboard/admin/performance/page.tsx` - Performance dashboard
- `app/dashboard/reports/page.tsx` - Daily/weekly summaries
- `app/api/reports/agent-summary/route.ts` - Agent metrics
- `app/api/reports/funnel/route.ts` - Funnel stats

### 7. **Team Management**
- Invite users
- Assign roles (admin/member)
- Assign to campaigns
- Reassign leads between reps
- Remove users

**Key Files:**
- `app/dashboard/admin/team/page.tsx` - Team management
- `app/api/team/*` - Team operations

---

## 🔧 Colin's Tasks - Implementation Analysis

### **Task 1: Add Tracking URL to SMS/Email** ⭐ (Priority)

**What's needed:**
Make it easy for users to insert their personal tracking URL when sending texts/emails.

**Current State:**
- ✅ Users can set SDR code in Settings
- ✅ Settings displays full tracking URL
- ✅ Copy button exists in Settings
- ❌ **Missing:** No way to insert in messaging UI

**Implementation Plan:**

#### Option A: Variable Substitution (Recommended)
Add a `{{tracking_url}}` variable that auto-replaces with user's URL.

**Files to modify:**
1. **Backend - Email Send (`app/api/email/send/route.ts`)**
   - After line 58, fetch user's `sdr_code` from `user_profiles`
   - Generate tracking URL: `${JCC_BASE_URL}?sdr=${sdr_code}`
   - Add to personalization vars alongside `{{name}}`, `{{address}}`

2. **Backend - SMS Send (`app/api/sms/send/route.ts`)**
   - Same as above - fetch SDR code, generate URL
   - Replace `{{tracking_url}}` in message body

3. **Frontend - Email Panel (`components/EmailPanel.tsx`)**
   - Add info banner: "Use `{{tracking_url}}` to insert your tracking link"
   - Maybe add a button: "Insert Tracking URL" that adds `{{tracking_url}}` to cursor position

4. **Frontend - SMS Panel (`components/SMSPanel.tsx`)**
   - Same as EmailPanel - info banner + insert button

5. **Frontend - Conversations (`app/dashboard/conversations/page.tsx`)**
   - Add insert button in message composer

**Estimated Effort:** 2-3 hours

#### Option B: Quick Insert Button
Add a button that fetches and inserts the full URL.

**Pros:** Simpler, no variable parsing needed  
**Cons:** Less flexible, longer URLs in templates

---

### **Task 2: Fix Performance Page** 📊

**Current State:**
- Page exists at `/dashboard/admin/performance`
- Has two tabs: "Performance" and "KPIs"
- Fetches from:
  - `/api/reports/agent-summary`
  - `/api/reports/funnel`
  - `/api/admin/kpis`
- Has campaign filtering
- Date range selection

**Potential Issues to Check:**
1. **Missing line 81:** There's a syntax error - function arrow is incomplete
   ```typescript
   const fetchPerformanceData = async () =>  // Missing opening brace!
   ```
   Should be: `const fetchPerformanceData = async () => {`

2. **API Endpoints:** May not exist or have errors
3. **Campaign Integration:** Campaign-based filtering might not work correctly
4. **Data Display:** Metrics might not calculate correctly

**Investigation Steps:**
1. Run the app and navigate to `/dashboard/admin/performance`
2. Check browser console for errors
3. Check Network tab for failed API calls
4. Test with different date ranges and campaigns
5. Verify data appears in both tabs

**Estimated Effort:** 1-2 hours (after testing to identify issue)

---

### **Task 3: Open-ended Improvements** 🔧

**Potential Quick Wins:**

1. **Update README.md**
   - Current README describes a basic "Google Maps Dashboard"
   - Should describe the full CRM system with all features

2. **Add Tracking URL Preview in Messaging**
   - Show user's tracking URL in a helper box
   - "Your tracking link: [copy button]"

3. **Template Variables Documentation**
   - Create a visible list of all available variables
   - `{{name}}`, `{{address}}`, `{{phone}}`, `{{tracking_url}}`

4. **Email Signature in Bulk Sends**
   - Ensure campaign signatures are applied consistently

5. **Performance Dashboard Enhancements**
   - Add CSV export for reports
   - Add comparison period (e.g., "vs. last month")

---

## 🗺️ Key User Flows

### **SDR Daily Workflow**
1. Login → Dashboard
2. See Today's Summary (calls, SMS, emails made)
3. Search for new leads OR go to Call Queue
4. Claim leads from campaign
5. Send SMS/Email with tracking URL
6. Make calls
7. Update lead status
8. View conversations for replies

### **Admin Workflow**
1. Login → Admin Dashboard
2. Create/manage campaigns
3. Assign users to campaigns
4. Import leads into campaigns
5. View Performance Dashboard
6. Review team metrics
7. Reassign leads if needed

### **Messaging Flow**
```
User Action → Frontend Component → API Route → External Service → Database → Webhook (status updates)
```

**Example - SMS:**
1. User types message in `SMSPanel.tsx`
2. Clicks "Send" → POST to `/api/sms/send`
3. API validates, personalizes message
4. Calls Twilio API
5. Saves to `sms_messages` table
6. Returns success to user
7. Twilio webhook updates status later

---

## 📁 Key Directories

```
app/
├── dashboard/              # Main app pages
│   ├── page.tsx           # Lead search dashboard
│   ├── leads/             # Lead management
│   ├── conversations/     # Unified inbox
│   ├── admin/             # Admin-only pages
│   │   ├── campaigns/     # Campaign management
│   │   ├── performance/   # Performance dashboard
│   │   └── team/          # Team management
│   └── settings/          # User & org settings
├── api/                   # API routes
│   ├── search/            # Google Maps search
│   ├── sms/               # SMS operations
│   ├── email/             # Email operations
│   ├── calls/             # Calling system
│   ├── campaigns/         # Campaign CRUD
│   ├── reports/           # Analytics
│   └── webhooks/          # External integrations
components/                 # React components
├── SMSPanel.tsx           # Bulk SMS sender
├── EmailPanel.tsx         # Bulk email sender
├── Softphone.tsx          # WebRTC calling
├── DataTable.tsx          # Lead table
└── ...
lib/
├── supabase/              # Supabase client
├── utils/                 # Utility functions
│   ├── leadDeduplication.ts
│   ├── telephony.ts
│   └── sdrMetrics.ts
└── types.ts               # TypeScript types
supabase/
└── migrations/            # 60 SQL migration files
```

---

## 🎓 Key Learnings

### **Database Design Patterns**
1. **Row Level Security (RLS):** All tables have policies enforcing data isolation
2. **Soft Deletes:** Leads go to recycle bin, not hard deleted
3. **Audit Trails:** Status changes logged in `status_change_logs`
4. **Campaign Isolation:** `campaign_members` and `campaign_leads` junction tables

### **API Patterns**
1. **Role-based filtering:** Admins see all, members see their data
2. **Server-side rendering:** Supabase client created per-request
3. **Webhook security:** Verify signatures from Twilio/Mailgun
4. **Error handling:** Consistent error responses

### **Frontend Patterns**
1. **Modal-based workflows:** `SMSPanel`, `EmailPanel`, `CallOptionsModal`
2. **Optimistic UI:** Messages appear before confirmation
3. **Real-time updates:** Polling for new messages
4. **Toast notifications:** User feedback for all actions

---

## ✅ Next Steps - Recommended Order

### **Phase 1: Test & Fix (Day 1)**
1. ✅ Pull Colin's updates (DONE)
2. ✅ Update dependencies (DONE)
3. 🔍 Test Performance Page - identify what's broken
4. 🐛 Fix Performance Page syntax error (line 81)
5. 🧪 Test all Performance Page features

### **Phase 2: Tracking URL Feature (Day 1-2)**
1. 📝 Design variable substitution approach
2. 🔧 Implement backend variable replacement
3. 🎨 Add UI insert buttons in SMS/Email panels
4. 🧪 Test in all messaging contexts
5. 📚 Document for users

### **Phase 3: Improvements (Day 2)**
1. 📖 Update README with full feature list
2. 🎨 Add tracking URL preview in messaging UI
3. 📋 Create variable documentation modal
4. 🧪 Test edge cases

---

## 🚀 Ready to Start!

**Recommendation:** Start with **Task 2 (Performance Page)** since it's likely a quick fix, then move to **Task 1 (Tracking URL)** which is the highest value feature.

**Estimated Total Time:** 4-6 hours for all three tasks

---

**Created:** December 9, 2025  
**Last Updated:** December 9, 2025

