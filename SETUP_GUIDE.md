# Outreach CRM - Setup & Testing Guide

Welcome! This guide will help you set up your account and start using the Outreach CRM system.

---

## 🚀 Getting Started

### Step 1: Create Your Account
1. Go to: https://app.mkeautosalvage.com/signup
2. Enter your email address and create a password
3. Click "Sign Up"
4. Check your email for a confirmation link and click it to verify your account
5. Once verified, go to: https://app.mkeautosalvage.com/login
6. Log in with your credentials

**Note**: Your data is completely private - you'll only see your own leads, calls, SMS, and emails.

---

## 📋 Main Features Overview

### 1. **Dashboard** - Search for Leads
- Search for businesses by location (e.g., "auto salvage in Detroit")
- Filter by status, distance, ratings
- View all lead details including phone numbers, emails, addresses
- **Email Scraper**: After initial search, the system automatically attempts to scrape email addresses from business websites if they're not provided by Google

### 2. **SMS History** - Send Text Messages
- Send SMS to individual leads or bulk SMS to multiple leads
- View all sent messages and their delivery status
- Use templates for quick messaging

### 3. **Call History** - Make Phone Calls
- Make live calls or drop voicemails to leads
- Track all calls with duration, status, and outcomes
- Add notes and schedule callbacks
- View call recordings (if available)

### 4. **Email History** - Send Emails
- Send personalized emails to leads
- Use templates with variable substitution
- Track email status (sent, delivered, opened, clicked)

### 5. **Twilio Numbers** - Manage Phone Numbers
- View available Twilio phone numbers
- Search and purchase new numbers
- Release numbers you no longer need

---

## 🧪 Live Testing Instructions

### Test 1: Search for Leads
1. Click on **"Dashboard"** in the navigation
2. In the search box, type: `auto salvage near Detroit, MI`
3. Click **"Search"** and wait for results
4. You should see a list of businesses with their details
5. Try filtering by status or sorting by different columns

**About Email Scraping**:
- Google doesn't always provide email addresses in search results
- The system automatically runs an **email scraper** in the background after the initial search
- It visits each business's website and attempts to find email addresses
- This may take a few minutes depending on how many results were found
- You'll see email addresses populate in the table as they're discovered
- Not all businesses will have emails found - it depends on if they have one on their website

**✅ Success Check**: You can see business names, addresses, phone numbers, and emails (some may be scraped after a few minutes)

---

### Test 2: Send an SMS
**Important**: Test with your own phone number first!

1. From the Dashboard, find a lead or click **"SMS History"** → **"Send SMS"**
2. If testing from Dashboard:
   - Select a lead with a phone number
   - Click the SMS icon (message bubble) in the CRM Actions column
3. In the SMS panel:
   - The recipient's number will be pre-filled
   - Type your message (e.g., "Hi, this is a test message from Outreach CRM")
   - Click **"Send SMS"**
4. Check your phone - you should receive the text within 1-2 minutes

**For Bulk SMS**:
1. On the Dashboard, select multiple leads using the checkboxes
2. Click **"Send SMS (X)"** button at the top
3. Type your message and click **"Send SMS"**

**✅ Success Check**: 
- Message shows "sent" status in SMS History
- You receive the actual text message on your phone

---

### Test 3: Make a Phone Call

**Option A: Live Call (Conference Mode)**
1. From the Dashboard, find a lead with a phone number
2. Click the phone icon in the CRM Actions column
3. Select **"Live Call"**
4. Enter your phone number (where you want to receive the call)
5. Click **"Initiate Call"**
6. **Your phone will ring first** - answer it
7. You'll hear: "Connecting you to [lead name]. Please hold."
8. The system will then dial the lead's number
9. When the lead answers, you'll be connected and can talk

**Option B: Voicemail Drop**
1. From the Dashboard, find a lead with a phone number
2. Click the phone icon in the CRM Actions column
3. Select **"Voicemail Drop"**
4. Type your voicemail message (e.g., "Hi, this is [Your Name] from On-Kaul Auto Salvage...")
5. Click **"Initiate Call"**
6. The system will call the lead and leave your message if they don't answer

**After the Call**:
1. Go to **"Call History"**
2. Find your call and click **"View Details"**
3. Update the outcome (e.g., "No Answer", "Left Voicemail", "Interested")
4. Add notes about the conversation
5. Set a callback date if needed

**✅ Success Check**: 
- Call appears in Call History
- Call duration is recorded
- You can update outcome and add notes

---

### Test 4: Send an Email

**Important**: Test with your own email first!

1. From the Dashboard, find a lead or click on a lead with an email address
2. Click the envelope icon (📧) in the CRM Actions column
3. In the Email Panel:
   - **From Name**: Should default to "On-Kaul Auto Salvage"
   - **Reply-To Email**: Enter the email address where replies should go (e.g., your work email)
   - **Template**: Select "Welcome Email" or "Follow-up Email"
   - **Subject**: Edit if needed
   - **Email Content**: Edit the message - you can use these variables:
     - `{{name}}` - Lead's business name
     - `{{address}}` - Lead's address
     - `{{sender_name}}` - Your name
   - Click **"Preview"** to see how the email will look
4. Click **"Send Emails"**
5. Check your inbox - you should receive the email

**For Bulk Emails**:
1. On the Dashboard, select multiple leads with email addresses
2. Click **"Send Email (X)"** button at the top
3. Compose your email and click **"Send Emails"**

**✅ Success Check**: 
- Email appears in "Email History"
- Status shows "sent" or "delivered"
- You receive the actual email in your inbox

---

## 📊 CRM Actions on Dashboard

For each lead, you have quick action buttons:

| Icon | Action | Description |
|------|--------|-------------|
| 📞 | Call | Make a live call or drop voicemail |
| 💬 | SMS | Send a text message |
| 📧 | Email | Send an email |
| 📝 | Notes | Add/view notes about the lead |
| 📅 | Callback | Schedule a follow-up |

---

## 💡 Tips for Best Results

### SMS Best Practices:
- Keep messages under 160 characters when possible
- Include your name and company
- Add a clear call-to-action
- Test templates before bulk sending

### Calling Best Practices:
- **Live Calls**: Your phone rings first, then the lead's. Be ready to talk when connected.
- **Voicemail Drops**: Keep message under 30 seconds
- Always add notes after calls to track conversations
- Update lead status based on interest level

### Email Best Practices:
- Use personalization variables ({{name}}, {{address}})
- Set a proper Reply-To email so leads can respond
- Preview emails before sending
- Keep subject lines clear and engaging
- Track opens and clicks in Email History

### Lead Management:
- Use the **Status** field to organize leads (New, Contacted, Interested, Not Interested, etc.)
- Add **Tags** to categorize leads
- Use **Priority** to focus on hot leads
- Set **Callback Dates** to stay organized

---

## 🔍 Recommended Testing Sequence

1. **Search & Filter** - Get comfortable finding leads
2. **SMS Test** - Send 1 test SMS to your phone
3. **Call Test** - Make 1 live call to your phone
4. **Email Test** - Send 1 test email to yourself
5. **Bulk Action** - Try bulk SMS or email to 2-3 test leads
6. **CRM Updates** - Practice adding notes and updating statuses
7. **Review History** - Check SMS, Call, and Email History pages

---

## ⚠️ Important Notes

- **Test with your own contact info first** before reaching out to real leads
- **Phone numbers must be in E.164 format**: `+1234567890` (for US) or `+639123456789` (for Philippines)
- **Twilio costs**: SMS ~$0.01/message, Calls ~$0.01-0.02/min (varies by country)
- **Your data is private**: Other users cannot see your leads or activity
- **Auto-save**: Most actions save automatically, but always check for confirmation

---

## 🆘 Troubleshooting

### SMS not sending?
- Check phone number format (must start with +)
- Verify number is valid in Twilio Numbers section
- Check SMS History for error messages

### Calls not connecting?
- Ensure phone numbers are in E.164 format
- Check if the country is enabled in Twilio Geo Permissions
- For international calls, verify the number is verified in Twilio

### Emails not received?
- Check spam/junk folder
- Verify email address is correct
- Check Email History for status and errors
- Ensure Reply-To email is set if you want responses

### Can't see any data?
- This is normal for new accounts - data is separated per user
- Start by searching for leads from the Dashboard

---

## 📞 Support

If you run into any issues:
1. Take a screenshot of the error
2. Note what you were trying to do
3. Check the relevant History page for error messages
4. Contact your system administrator for assistance

---

## ✨ Ready to Go Live!

Once you've completed the testing sequence above and feel comfortable with the system, you're ready to start reaching out to real leads!

**Suggested Workflow**:
1. Search for leads in your target area
2. Review lead details and prioritize
3. Send initial SMS or email to introduce yourself
4. Follow up with calls to interested leads
5. Update lead status and add notes after each interaction
6. Schedule callbacks for follow-ups
7. Track your progress in the History pages

Good luck! 🚀

---

*Last Updated: October 30, 2025*


