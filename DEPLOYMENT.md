# 🚀 Deployment Guide - Google Maps Data Dashboard

Complete guide for deploying your Google Maps Dashboard to Vercel.

## Prerequisites

Before deploying, ensure you have:

- ✅ A GitHub account
- ✅ A Vercel account (free tier works)
- ✅ Your Supabase project URL and anon key
- ✅ Your Google Maps API key

---

## Step 1: Push to GitHub

If you haven't already, push your code to GitHub:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Google Maps Dashboard"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/google-maps-dashboard.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy to Vercel

### Option A: Via Vercel Website (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Click **"Import Git Repository"**
4. Select your `google-maps-dashboard` repository
5. Vercel will auto-detect Next.js - keep default settings
6. Click **"Deploy"**

Your app will deploy but won't work yet (needs environment variables).

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (your account)
# - Link to existing project? No
# - Project name? google-maps-dashboard
# - Directory? ./
# - Override settings? No

# Deploy to production
vercel --prod
```

---

## Step 3: Add Environment Variables

After deployment, you need to add environment variables:

### Via Vercel Dashboard:

1. Go to your project on Vercel
2. Click **Settings** → **Environment Variables**
3. Add the following variables:

| Name                  | Value                         | Environment                      |
| --------------------- | ----------------------------- | -------------------------------- |
| `SUPABASE_URL`        | `https://xxxxx.supabase.co`   | Production, Preview, Development |
| `SUPABASE_ANON_KEY`   | `eyJhbGciOiJIUzI1NiIsI...`    | Production, Preview, Development |
| `GOOGLE_MAPS_API_KEY` | `AIzaSyXXXXXXXXXXXXXX`        | Production, Preview, Development |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production, Preview, Development |

4. Click **"Save"** for each variable
5. Go to **Deployments** tab
6. Click **"Redeploy"** on the latest deployment

### Via Vercel CLI:

```bash
# Add environment variables
vercel env add SUPABASE_URL
# Paste your Supabase URL when prompted
# Select: Production, Preview, Development (all)

vercel env add SUPABASE_ANON_KEY
# Paste your Supabase anon key

vercel env add GOOGLE_MAPS_API_KEY
# Paste your Google Maps API key

vercel env add NEXT_PUBLIC_APP_URL
# Enter your Vercel URL (e.g., https://your-app.vercel.app)

# Redeploy
vercel --prod
```

---

## Step 4: Configure Supabase for Production

### Update Supabase Site URL

**🚨 CRITICAL**: This fixes the "localhost" redirect issue in email confirmations.

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Set **Site URL** to: `https://your-app.vercel.app`
5. Add **Redirect URLs**:
   - `https://your-app.vercel.app`
   - `https://your-app.vercel.app/dashboard`
   - `https://*.vercel.app/**` (for preview deployments)
6. Click **Save**

**⚠️ Important**: After changing the Site URL, users who click old email confirmation links will be redirected to localhost. They need to request a new confirmation email.

---

## Step 5: Verify Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Click **"Sign Up"** and create a test account
3. Check your email for Supabase confirmation
4. Confirm your account
5. Log in and test a search:
   - Keyword: `coffee shop`
   - Location: `Seattle, WA`
   - Results: `20`
6. Click **"Search"** and wait for results
7. Test CSV and Excel export
8. Check the **History** tab

---

## Step 6: Custom Domain (Optional)

### Add a Custom Domain:

1. In Vercel Dashboard, go to **Settings** → **Domains**
2. Enter your domain name (e.g., `maps.yourdomain.com`)
3. Follow DNS configuration instructions
4. Update `NEXT_PUBLIC_APP_URL` environment variable to your custom domain
5. Update Supabase **Site URL** to your custom domain
6. Redeploy

---

## Troubleshooting

### "Invalid API Key" Error

**Problem**: Google Maps API key not working

**Solution**:

1. Verify the API key is added to Vercel environment variables
2. Check that Places API and Geocoding API are enabled in Google Cloud
3. Ensure the API key has no restrictions blocking Vercel's IPs
4. Redeploy after adding/updating the key

### Authentication Not Working

**Problem**: Can't sign up or log in

**Solution**:

1. Verify Supabase URL and anon key in Vercel environment variables
2. Check Supabase **Site URL** matches your Vercel URL
3. Check redirect URLs include your Vercel domain
4. Look at Vercel function logs: **Deployments** → Click deployment → **Functions** tab

### "Table does not exist" Error

**Problem**: Search history not saving

**Solution**:

1. Verify you ran the `supabase-setup.sql` in Supabase SQL Editor
2. Check table exists: Go to Supabase → **Table Editor**
3. Verify RLS policies are enabled

### Slow Performance

**Problem**: Searches take too long

**Solution**:

1. This is normal for large result counts (100-200 results)
2. Google Places API has rate limits and pagination delays
3. Consider reducing default result count
4. Implement caching (advanced)

---

## Environment Variables Reference

```bash
# Production Environment Variables for Vercel

# Supabase (get from: supabase.com → project → Settings → API)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google Maps (get from: console.cloud.google.com → Credentials)
GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX

# App URL (your Vercel deployment URL)
NEXT_PUBLIC_APP_URL=https://your-app-name.vercel.app
```

---

## Monitoring & Logs

### View Application Logs:

1. Go to Vercel Dashboard
2. Select your project
3. Click **Deployments**
4. Click on a deployment
5. Click **Functions** tab to see API logs
6. Click **Build Logs** to see build errors

### Common Log Messages:

- ✅ `Search successful` - Search completed
- ⚠️ `Google API error` - Check API key and quota
- ❌ `Unauthorized` - Authentication issue
- ❌ `Failed to save search history` - Database issue

---

## Costs & Quotas

### Vercel (Free Tier)

- ✅ 100 GB bandwidth/month
- ✅ Unlimited function invocations
- ✅ Commercial use allowed

### Supabase (Free Tier)

- ✅ 500 MB database
- ✅ 50,000 monthly active users
- ✅ Unlimited API requests

### Google Maps (Pay-as-you-go)

- 💰 Text Search: $32 per 1,000 requests
- 💰 Place Details: $17 per 1,000 requests
- 💳 $200 free credit per month
- 💡 ~2,800 free searches/month (with 20 results each)

**Cost Example**: 100 searches with 20 results = ~$10

- Text Search: 100 × $0.032 = $3.20
- Place Details: 2,000 × $0.017 = $34.00
- **Total**: ~$37.20 (covered by $200 free credit)

---

## Next Steps

1. ✅ Share the URL with your team
2. ✅ Monitor usage in Google Cloud Console
3. ✅ Set up billing alerts in Google Cloud
4. ✅ Consider implementing search result caching
5. ✅ Add more team members to Supabase project

---

## Support & Maintenance

### Regular Maintenance:

- Monitor Google Maps API quota
- Check Supabase storage usage
- Review Vercel bandwidth usage
- Update dependencies monthly: `npm update`

### Backing Up Data:

```bash
# Export Supabase data (from Supabase dashboard)
# Go to: Database → Backups → Download
```

---

**Deployment Complete! 🎉**

Your Google Maps Data Dashboard is now live and ready for your team to use.
