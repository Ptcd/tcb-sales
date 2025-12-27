# 🚀 Quick Setup Guide

Get your Google Maps Dashboard running in minutes.

## **One Command Setup**

```bash
npm run setup
```

This will:

1. ✅ Check environment variables
2. ✅ Connect to your Supabase project
3. ✅ Run all migrations
4. ✅ Generate TypeScript types
5. ✅ Start the development server

---

## **Setup Process**

### **1. Create `.env.local`**

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### **2. Run Setup**

```bash
npm run setup
```

### **3. Test at http://localhost:3000**

---

## **Available Scripts**

```bash
# Complete setup + start dev server
npm run setup

# Setup Supabase connection and migrations
npm run supabase:setup

# Run migrations only
npm run supabase:migrate

# Check everything status
npm run supabase:status

# Start development server
npm run dev
```

---

## **Troubleshooting**

- **Environment variables not found** → Check `.env.local` file
- **Failed to link to project** → Verify Supabase URL format and access
- **Migration failed** → Check internet connection and project status

---

## **Ready to Use!**

After running `npm run setup`:

1. ✅ Supabase database connected with `search_history` table
2. ✅ TypeScript types generated
3. ✅ All migrations applied
4. ✅ Development server started

**Visit http://localhost:3000 to test your Google Maps Dashboard!** 🚀
