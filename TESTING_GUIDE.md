# 🧪 Complete Testing Guide

## 🎯 **Step 1: Fix Placeholder Text Color** ✅ COMPLETED

- ✅ Updated `AuthForm.tsx` with `placeholder-gray-700` class
- ✅ Updated `SearchForm.tsx` with `placeholder-gray-700` class
- ✅ Placeholder text now has better contrast and readability

## 🚀 **Step 2: Local Development Testing**

### **Prerequisites Check:**

1. ✅ Environment variables in `.env.local`
2. ✅ Supabase database tables created
3. ✅ Google Maps API key configured
4. ✅ Development server running

### **Testing Checklist:**

#### **🔐 Authentication Flow Test:**

1. **Visit** http://localhost:3000
2. **Verify** landing page loads with blue gradient
3. **Click** "Get Started" → should go to signup page
4. **Fill form**:
   - Email: `test@example.com`
   - Password: `password123`
5. **Click** "Create account"
6. **Check** Supabase Auth dashboard for new user
7. **Verify** redirect to dashboard after signup

#### **🔍 Search Functionality Test:**

1. **On dashboard**, test search form:
   - Keyword: `coffee shop`
   - Location: `Seattle, WA`
   - Results: `20`
2. **Click** "🔍 Search Google Maps"
3. **Verify** loading spinner appears
4. **Wait** 10-30 seconds for results
5. **Check** results table displays businesses
6. **Verify** data includes: name, address, phone, rating, website

#### **📥 Export Functionality Test:**

1. **After search results appear**
2. **Click** "📥 Export CSV" → should download file
3. **Click** "📥 Export Excel" → should download file
4. **Open files** and verify data integrity

#### **📊 History Functionality Test:**

1. **Click** "History" tab in navigation
2. **Verify** search appears in history table
3. **Check** data: keyword, location, result count, timestamp

#### **📱 Mobile Responsiveness Test:**

1. **Open** browser dev tools (F12)
2. **Toggle** device toolbar (mobile view)
3. **Test** all functionality on mobile view
4. **Verify** forms and tables are responsive

---

## 🐛 **Common Issues & Solutions**

### **"Invalid API Key" Error:**

```bash
# Check your .env.local file has:
GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX

# Verify in Google Cloud Console:
# 1. Places API (new) is enabled
# 2. Geocoding API is enabled
# 3. API key has no restrictions or allows your IP
```

### **"Table does not exist" Error:**

```sql
-- Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  results_found INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### **Authentication Not Working:**

```bash
# Check Supabase configuration:
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# In Supabase Dashboard:
# 1. Authentication → Settings → Site URL = http://localhost:3000
# 2. Authentication → Settings → Redirect URLs = http://localhost:3000/**
```

### **No Search Results:**

- ✅ **Normal behavior** - some locations/keywords may have no results
- ✅ **Try different combinations**:
  - `restaurant in New York, NY`
  - `auto repair in Chicago, IL`
  - `plumber in Los Angeles, CA`
- ✅ **Check browser console** for API errors

### **Slow Performance:**

- ✅ **Expected** for large result counts (100-200)
- ✅ **Google API rate limits** cause delays between requests
- ✅ **Consider testing with 10-20 results first**

---

## 🎯 **Success Criteria**

### **✅ All Tests Pass When:**

1. **Landing page** loads with modern design
2. **Signup/Login** works without errors
3. **Dashboard** loads with search form
4. **Search** returns business data (even if 0 results)
5. **Export** downloads CSV/Excel files
6. **History** shows previous searches
7. **Mobile view** is responsive
8. **No console errors** in browser dev tools

### **🚀 Ready for Production When:**

- ✅ All local tests pass
- ✅ Environment variables configured
- ✅ Database tables created
- ✅ API keys working
- ✅ No critical errors in console

---

## 📋 **Quick Test Commands**

```bash
# Start development server
npm run dev

# Check for TypeScript errors
npm run build

# View application
open http://localhost:3000

# Check browser console
# Press F12 → Console tab
```

---

## 🎉 **Next Steps After Testing**

Once local testing is successful:

1. **Push to GitHub**: `git add . && git commit -m "Ready for deployment" && git push`
2. **Deploy to Vercel**: Follow `DEPLOYMENT.md`
3. **Update Supabase**: Set production URL
4. **Share with team**: Test live deployment

---

**🎯 Ready to test?** Open http://localhost:3000 and start with the authentication flow!
