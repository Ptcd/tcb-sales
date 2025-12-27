# 🎉 New Conversation Features - Setup & Usage Guide

## ✨ What's New

Three major features to transform the CRM into a complete conversation system:

### 1. **Two-Way SMS Conversations** 📱
- Receive SMS replies from leads (not just send)
- See full conversation threads
- Automatic inbound message handling

### 2. **Conversation Inbox UI** 💬
- WhatsApp-like interface
- See all conversations in one place
- Unread message counts
- Quick reply functionality
- Real-time message threads

### 3. **Manual Lead Creation** ➕
- Add leads manually (not just from Google Maps)
- Start conversations with any lead
- Full CRM functionality for manual leads

---

## 🚀 Setup Instructions

### Step 1: Run Database Migration

**You MUST run this SQL migration in Supabase before the features will work:**

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard
2. Navigate to: **SQL Editor** (left sidebar)
3. Copy the contents of: `supabase/migrations/20241105000000_add_conversations_support.sql`
4. Paste into SQL Editor
5. Click **Run**

This migration adds:
- `direction` column to `sms_messages` (inbound/outbound)
- `is_read` flag for tracking read status
- `lead_source` column to `search_results` (google_maps/manual)
- `conversation_threads` view for inbox
- Makes `search_history_id` nullable for manual leads

### Step 2: Configure Twilio Webhook for Inbound SMS

**Important: Twilio needs to know where to send incoming SMS messages!**

1. Go to **Twilio Console**: https://console.twilio.com
2. Navigate to: **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number
4. Scroll to **Messaging Configuration**
5. Under **A MESSAGE COMES IN**:
   - **URL**: `https://app.mkeautosalvage.com/api/twilio/sms`
   - **HTTP Method**: POST
6. Click **Save**

Now when leads reply to your SMS, they'll appear in your Conversations inbox!

### Step 3: Wait for Deployment

- Vercel will automatically deploy the new code (~2-3 minutes)
- Check deployment status: https://vercel.com/dashboard

---

## 📖 How to Use

### 🗨️ Conversations Page

**Access:** Click "Conversations" in the navigation

**Features:**
- **Left Panel**: List of all conversation threads
  - Shows lead name, phone, last message
  - Unread count badge
  - Search conversations
- **Right Panel**: Full message thread
  - Sent messages (blue, right-aligned)
  - Received messages (gray, left-aligned)
  - Lead contact info at top
  - Quick reply box at bottom

**Usage:**
1. Click any conversation to view messages
2. Type a reply in the text box
3. Press Enter or click Send
4. Messages are automatically marked as read

### ➕ Add Manual Lead

**Access:** Click "Add Lead" button on Dashboard

**Required Fields:**
- Name (required)
- Phone Number (required)

**Optional Fields:**
- Email
- Address
- Website
- Notes

**Usage:**
1. Click "Add Lead" button
2. Fill in lead information
3. Click "Create Lead"
4. Lead is immediately available for:
   - SMS conversations
   - Calls
   - Emails
   - Notes
   - Activities

### 📲 Two-Way SMS Flow

**Outbound (You → Lead):**
1. Send SMS from Dashboard or Conversations
2. Message appears in conversation thread (blue, right side)

**Inbound (Lead → You):**
1. Lead replies to your SMS
2. Twilio webhook receives the reply
3. Message saved to database automatically
4. Appears in Conversations inbox with unread badge
5. Click conversation to view and reply

---

## 🔍 Technical Details

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/twilio/sms` | POST | Webhook for inbound SMS |
| `/api/conversations` | GET | Get all conversation threads |
| `/api/conversations/[leadId]` | GET | Get messages for a lead |
| `/api/conversations/[leadId]` | POST | Send SMS in conversation |
| `/api/leads/create` | POST | Manually create a lead |

### Database Changes

**`sms_messages` table:**
- Added `direction` (inbound/outbound)
- Added `is_read` (boolean)

**`search_results` table:**
- Added `lead_source` (google_maps/manual)
- Made `search_history_id` nullable

**New view:** `conversation_threads`
- Pre-aggregated conversation data
- Unread counts
- Last message info
- Optimized for inbox display

### Security

- All APIs protected by authentication
- RLS policies enforce organization-level data isolation
- Inbound webhook uses service role to bypass RLS
- Messages automatically linked to correct organization

---

## 🎯 What This Solves

### Before:
❌ Could only send SMS (one-way)
❌ No way to see replies from leads
❌ Couldn't add leads manually
❌ No unified conversation view

### After:
✅ Full two-way SMS conversations
✅ Inbox-style interface (like WhatsApp)
✅ Add any lead manually
✅ See all conversations in one place
✅ Unread message tracking
✅ Quick reply functionality
✅ Complete conversation history

---

## 🧪 Testing Checklist

### Test 1: Send SMS and Receive Reply
1. Go to Dashboard
2. Select a lead with phone number
3. Send SMS
4. Have someone reply to that number
5. Go to Conversations page
6. Verify reply appears with unread badge
7. Click conversation
8. Verify message marked as read
9. Reply from Conversations page

### Test 2: Manual Lead Creation
1. Click "Add Lead" on Dashboard
2. Fill in: Name, Phone, Email
3. Click "Create Lead"
4. Verify lead appears in system
5. Try sending SMS to manual lead
6. Verify conversation appears in Conversations page

### Test 3: Conversation Thread
1. Send multiple SMS to a lead
2. Have lead reply multiple times
3. View conversation in Conversations page
4. Verify all messages show in correct order
5. Verify sent messages (blue, right)
6. Verify received messages (gray, left)

---

## 🐛 Troubleshooting

### Inbound SMS Not Appearing?

**Check Twilio Webhook:**
1. Go to Twilio Console → Calls & SMS Logs
2. Find recent inbound SMS
3. Check webhook delivery status
4. Verify URL is: `https://app.mkeautosalvage.com/api/twilio/sms`

**Check Supabase Logs:**
1. Go to Supabase Dashboard → Logs
2. Filter by API endpoint
3. Look for errors in `/api/twilio/sms`

**Check Migration:**
1. Verify migration ran successfully
2. Check `sms_messages` table has `direction` and `is_read` columns

### Can't Create Manual Lead?

**Check Required Fields:**
- Name and Phone are required
- Phone should be in valid format

**Check Organization:**
- Verify you're logged in
- Check user has organization_id

### Conversations Page Empty?

**Possible Causes:**
- No SMS conversations yet (need to send/receive at least one SMS)
- Migration not run (view doesn't exist)
- RLS policy issue (check organization_id)

---

## 📱 Mobile Responsiveness

- Conversations page optimized for desktop (two-pane layout)
- Mobile shows conversation list first
- Click conversation to view messages
- All features work on mobile

---

## 🎨 UI Features

- **Unread Badges**: Blue circles with count
- **Message Direction**: ↓ for inbound, ↑ for outbound
- **Timestamps**: Smart formatting (Today/Yesterday/Date)
- **Search**: Filter conversations by name, phone, or message
- **Auto-scroll**: New messages auto-scroll to bottom
- **Enter to Send**: Press Enter to send (Shift+Enter for new line)

---

## 🚀 Ready to Use!

All features are now deployed and ready. Just:
1. Run the database migration in Supabase
2. Configure Twilio webhook
3. Start having conversations with your leads!

Enjoy your new conversation-powered CRM! 🎉

