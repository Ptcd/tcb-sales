# 🚀 Quick Setup Checklist

Follow these steps to get your Google Maps Dashboard running locally:

## ✅ Step 1: Environment Variables

**CRITICAL**: You must have these set up in `.env.local`:

```bash
# Copy from your Supabase project dashboard
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Copy from Google Cloud Console
GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX

# For local development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## ✅ Step 2: Supabase Database Setup

**MUST DO**: Run this SQL in your Supabase SQL Editor:

1. Go to [app.supabase.com](https://app.supabase.com) → Your Project → **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents of `supabase-setup.sql` file
4. Paste and click **"Run"**
5. Verify you see success messages

## ✅ Step 3: Test Local Development

The dev server should be running at: **http://localhost:3000**

### Test Flow:

1. **Visit** http://localhost:3000
2. **Click** "Get Started" or "Sign Up"
3. **Create** a test account (check email for confirmation)
4. **Confirm** your email in Supabase dashboard if needed
5. **Log in** to dashboard
6. **Test search**:
   - Keyword: `coffee shop`
   - Location: `Seattle, WA`
   - Results: `20`
   - Click **"🔍 Search Google Maps"**
7. **Wait** 10-30 seconds for results
8. **Test export** (CSV/Excel buttons)
9. **Check History** tab

## 🐛 Common Issues & Fixes

### "Invalid API Key" Error

- ✅ Verify `GOOGLE_MAPS_API_KEY` in `.env.local`
- ✅ Check Google Cloud Console: Places API & Geocoding API enabled
- ✅ Restart dev server: `Ctrl+C` then `npm run dev`

### "Table does not exist" Error

- ✅ Run the `supabase-setup.sql` in Supabase SQL Editor
- ✅ Check Supabase → Table Editor → search_history exists

### Can't Sign Up/Login

- ✅ Verify Supabase URL and anon key in `.env.local`
- ✅ Check Supabase → Authentication → Settings → Site URL = `http://localhost:3000`

### No Search Results

- ✅ This is normal for some locations/keywords
- ✅ Try: `restaurant in New York, NY` (more likely to have results)
- ✅ Check browser console for API errors

## 📱 What You Should See

### Landing Page (http://localhost:3000)

- Clean blue gradient background
- "Google Maps Data Dashboard" title
- "Get Started" and "Sign In" buttons
- Feature cards (Smart Search, Rich Data, Export Easily)

### Sign Up Page

- Email and password fields
- "Create account" button
- "Already have an account? Sign in" link

### Dashboard (after login)

- Navigation bar with "📍 Maps Dashboard"
- "Search" and "History" tabs
- Search form with keyword/location inputs
- Results table (after search)
- Export buttons (CSV/Excel)

### History Page

- Table showing previous searches
- Date, keyword, location, results found

## 🎯 Ready for Production?

Once local testing works:

1. **Push to GitHub**: `git add . && git commit -m "Ready for deployment" && git push`
2. **Deploy to Vercel**: Follow `DEPLOYMENT.md` guide
3. **Update Supabase**: Set Site URL to your Vercel URL
4. **Test live**: Share URL with your team

## 💡 Pro Tips

- **Start small**: Test with 10-20 results first
- **Check quotas**: Monitor Google Cloud Console for API usage
- **Email confirmation**: Supabase may require email verification
- **Rate limits**: Google API has delays between paginated requests

---

**🎉 You're ready to test!** Open http://localhost:3000 and start searching!
