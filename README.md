# 🗺️ Google Maps Data Dashboard

A modern, secure web application for searching and exporting Google Maps business data. Built with Next.js, Supabase, and Google Places API.

## ✨ Features

- 🔐 **Secure Authentication** - Email/password login via Supabase Auth
- 🔍 **Google Maps Search** - Search businesses by keyword and location
- 📊 **Results Table** - Clean, sortable table view of business data
- 📥 **CSV/Excel Export** - Download results in multiple formats
- 📝 **Search History** - Track previous searches
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS
- ⚡ **Fast Performance** - Optimized for searches up to 200 results
- 🔒 **Secure API Keys** - All API keys stored server-side only

## 🚀 Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **API**: Google Places API
- **Deployment**: Vercel

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- A Supabase account and project
- A Google Cloud account with Places API enabled
- npm or yarn package manager

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd google-maps-data-dashboard
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Go to [Supabase](https://supabase.com) and create a new project
2. Once your project is ready, go to **Settings → API**
3. Copy your **Project URL** and **anon/public key**

#### Create Database Tables

Run the following SQL in the Supabase SQL Editor:

```sql
-- Create search_history table
CREATE TABLE search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  results_found INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only see their own history
CREATE POLICY "Users can view their own search history"
  ON search_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX search_history_user_id_idx ON search_history(user_id);
CREATE INDEX search_history_created_at_idx ON search_history(created_at DESC);
```

### 4. Create Database Tables in Supabase

**IMPORTANT**: You must run this SQL to create the required database table.

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **"New Query"**
4. Copy and paste the contents of `supabase-setup.sql` file (located in project root)
5. Click **"Run"** or press `Ctrl/Cmd + Enter`
6. Verify success message appears

Alternatively, you can run this SQL directly:

```sql
-- Create search_history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  results_found INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX search_history_user_id_idx ON search_history(user_id);
CREATE INDEX search_history_created_at_idx ON search_history(created_at DESC);
```

### 5. Set Up Google Places API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Places API** (new) and **Geocoding API**
4. Go to **Credentials** and create an **API Key**
5. Restrict the API key to only the necessary APIs for security

### 6. Configure Environment Variables

Create a `.env.local` file in your project root and add your credentials:

```env
# Supabase Configuration (server-side only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Google Maps API Key (server-side only)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 7. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🚀 Deployment to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:

```bash
npm i -g vercel
```

2. Run deploy command:

```bash
vercel
```

3. Follow the prompts to link your project

4. Add environment variables in the Vercel dashboard:
   - Go to your project → Settings → Environment Variables
   - Add all variables from `.env.local`

### Option 2: Deploy via GitHub

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com) and sign in
3. Click **"Add New Project"**
4. Import your GitHub repository
5. Add environment variables in the project settings
6. Click **Deploy**

## 📖 Usage

### First Time Setup

1. Visit your deployed URL
2. Click **"Sign Up"** and create an account
3. Check your email and confirm your account (Supabase will send a confirmation email)
4. Log in with your credentials

### Searching for Businesses

1. Enter a **keyword** (e.g., "auto repair", "plumber", "restaurants")
2. Enter a **location** (city name or ZIP code)
3. Select the **number of results** you want (10-200)
4. Click **"Search"**
5. Wait for results to load (typically 10-60 seconds depending on result count)

### Exporting Results

Once results are displayed:

- Click **"Export CSV"** to download as CSV
- Click **"Export Excel"** to download as XLSX

### Viewing Search History

- Navigate to the **History** tab to see all previous searches
- History includes: keyword, location, result count, and timestamp

## 📁 Project Structure

```
google-maps-data-dashboard/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   ├── search/          # Google Places search endpoint
│   │   └── history/         # Search history endpoint
│   ├── login/               # Login page
│   ├── signup/              # Signup page
│   ├── dashboard/           # Protected dashboard
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing page
├── lib/                     # Utility libraries
│   ├── supabase/            # Supabase client setup
│   ├── types.ts             # TypeScript types
│   └── utils/               # Utility functions
├── components/              # React components
│   ├── SearchForm.tsx       # Search form component
│   ├── ResultsTable.tsx     # Results table component
│   └── ...
├── .env.example             # Example environment variables
├── middleware.ts            # Next.js middleware for auth
└── README.md                # This file
```

## 🔒 Security Features

- **Authentication**: Secure email/password auth via Supabase
- **Row Level Security**: Users can only access their own data
- **API Key Protection**: All API keys (Google Maps, Supabase) server-side only
- **Protected Routes**: Middleware ensures only authenticated users access dashboard
- **Session Management**: Automatic token refresh and secure cookie handling
- **Backend-Only Database**: All database operations handled server-side

## 🎨 Customization

### Changing the Theme

Edit `tailwind.config.ts` to customize colors, fonts, and spacing.

### Modifying Search Parameters

Edit `app/api/search/route.ts` to adjust:

- Result fields returned
- Search radius
- Business types
- Ranking preferences

## 🐛 Troubleshooting

### "Invalid API Key" Error

- Verify your Google Maps API key is correct in `.env.local`
- Ensure Places API is enabled in Google Cloud Console
- Check API key restrictions aren't blocking requests

### Supabase Connection Issues

- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Ensure your Supabase project is active
- Check if you've run the database migration SQL

### No Results Found

- Verify your search location is valid
- Try a broader keyword
- Check your API quota in Google Cloud Console

## 📝 License

This project is provided with full ownership rights upon delivery.

## 🤝 Support

For issues or questions:

1. Check the troubleshooting section above
2. Review Supabase and Google Places API documentation
3. Check the GitHub issues page

## 🔄 Updating the App

To update your deployed app:

```bash
git add .
git commit -m "Your changes"
git push
```

Vercel will automatically deploy your changes.

## 📊 API Rate Limits

- **Google Places API**: Check your quota in Google Cloud Console
- **Supabase**: Free tier includes 50,000 monthly active users
- Consider implementing caching for frequently searched locations

## 🎯 Future Enhancements

Potential features to add:

- [ ] Bulk search with multiple locations
- [ ] Advanced filtering options
- [ ] Map visualization of results
- [ ] Scheduled automated searches
- [ ] Email reports
- [ ] Team collaboration features
- [ ] API rate limiting per user

---

Built with ❤️ using Next.js, Supabase, and Google Places API
