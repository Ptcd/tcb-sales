 # 📧 Email Scraper Feature Guide

## Overview

The Email Scraper feature automatically extracts email addresses from business websites after performing a Google Maps search. Since the Google Places API doesn't provide email addresses, this feature fills that gap by crawling the business websites.

## Features

✅ **Smart Email Extraction**
- Scrapes email addresses from business websites
- Checks homepage and common contact pages (/contact, /about, etc.)
- Validates emails to filter out fake/placeholder addresses
- Handles mailto: links

✅ **Batch Processing**
- Processes multiple websites concurrently (5 at a time)
- Respectful rate limiting to avoid overwhelming servers
- Automatic retry logic for failed requests

✅ **Database Integration**
- Stores emails in the `search_results` table
- Emails are included in CSV/Excel exports
- Displayed in the results table with clickable mailto: links

## How to Use

### 1. Prerequisites

Before using the email scraper, you need to:

1. **Run the database migration** to add the email column:
   ```bash
   # Option 1: Using Supabase CLI (if you have it installed)
   supabase migration up
   
   # Option 2: Run the SQL manually in Supabase SQL Editor
   # Copy the contents of: supabase/migrations/20241220000000_add_email_to_search_results.sql
   # Paste and run it in your Supabase project's SQL Editor
   ```

2. **Ensure dependencies are installed** (already done if you followed setup):
   ```bash
   npm install
   ```

### 2. Performing a Search with Email Scraping

1. **Go to the Dashboard** and perform a normal Google Maps search:
   - Enter business type (e.g., "dentist", "restaurant")
   - Enter location (e.g., "Chicago, IL")
   - Select number of results
   - Click "Search"

2. **Wait for search results** to load

3. **Click "Extract Emails from Websites"** button that appears above the results table

4. **Wait for email scraping to complete**:
   - The button will show a loading spinner
   - A toast notification will show progress
   - Results table will automatically update with found emails

### 3. Viewing Results

- **In the Table**: Email addresses appear in the "Email" column
- **Click on Email**: Opens your default email client with a new message
- **Export Data**: Emails are included in CSV and Excel exports

## How It Works

### Technical Flow

```
1. User performs Google Maps search
   ↓
2. Search results saved to database (emails = null)
   ↓
3. User clicks "Extract Emails" button
   ↓
4. API endpoint fetches all results with websites but no emails
   ↓
5. For each website:
   - Try homepage first
   - If no email found, try /contact, /about, etc.
   - Extract emails using regex patterns
   - Validate email addresses
   - Save to database
   ↓
6. Return summary (X emails found from Y websites)
   ↓
7. UI refreshes to show updated results
```

### Email Extraction Logic

The scraper:
- Uses **Axios** for HTTP requests (fast and simple)
- Uses **Cheerio** for HTML parsing (jQuery-like syntax)
- Searches for:
  - Email addresses in text content
  - Email addresses in HTML/meta tags
  - `mailto:` links
- Validates emails to exclude:
  - Image files (.png, .jpg, etc.)
  - Example domains (example.com, yourdomain.com)
  - Invalid formats

### Rate Limiting

To be respectful to websites:
- **5 concurrent requests** at a time
- **500ms delay** between pages on the same domain
- **1 second delay** between batches
- **8 second timeout** per request

## Configuration

You can adjust the scraper behavior in `lib/utils/emailScraper.ts`:

```typescript
// In scrapeEmailFromWebsite function
{
  timeout: 8000,        // Timeout in milliseconds
  maxPages: 3          // Max pages to check per website
}

// In batchScrapeEmails function
{
  concurrency: 5,      // Number of concurrent requests
  timeout: 8000,       // Timeout per request
  maxPages: 3          // Max pages per website
}
```

## API Endpoints

### POST `/api/scrape-emails`

Scrapes emails for a specific search history.

**Request:**
```json
{
  "searchHistoryId": "uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "scraped": 20,
  "found": 15,
  "total": 20,
  "message": "Found 15 email(s) from 20 website(s)"
}
```

### GET `/api/history/[id]/results`

Fetches updated search results including emails.

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "place-id",
      "name": "Business Name",
      "email": "info@business.com",
      ...
    }
  ],
  "count": 20
}
```

## Troubleshooting

### No emails found

**Possible reasons:**
- Website doesn't have an email address publicly visible
- Email is hidden in JavaScript (we only check static HTML)
- Website blocks automated requests
- Website is down or slow to respond

**Solutions:**
- Some businesses don't publish emails - this is normal
- Try viewing the website manually to verify
- Consider adding manual email entry feature

### Slow scraping

**Possible reasons:**
- Many results to process
- Websites are slow to respond
- Network latency

**Solutions:**
- This is expected for large result sets (e.g., 200 results)
- Scraping 100 websites can take 2-5 minutes
- Consider reducing result count for faster scraping

### Database errors

**Error: column "email" does not exist**

**Solution:** Run the database migration:
```sql
-- In Supabase SQL Editor:
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_search_results_email ON search_results(email) WHERE email IS NOT NULL;
```

## Future Enhancements

Potential improvements:
- [ ] Background job processing (use Inngest or BullMQ)
- [ ] Progress indicator showing X/Y websites scraped
- [ ] Automatic email scraping (optional setting)
- [ ] Support for JavaScript-rendered emails (use Puppeteer)
- [ ] Email verification service integration
- [ ] Manual email entry/editing
- [ ] Email enrichment APIs (e.g., Hunter.io, Clearbit)

## Testing

### Manual Testing Steps

1. **Test Basic Flow:**
   ```
   - Search for "coffee shop in San Francisco"
   - Limit to 10 results
   - Click "Extract Emails"
   - Verify emails appear in table
   - Export to CSV and check email column
   ```

2. **Test Edge Cases:**
   ```
   - Search with no results → Should handle gracefully
   - Search with no websites → Should show appropriate message
   - Search already has emails → Should skip already scraped
   ```

3. **Test Error Handling:**
   ```
   - Disconnect internet during scraping
   - Invalid search history ID
   - Unauthorized access attempt
   ```

### Automated Testing (Future)

Create tests for:
- Email regex validation
- URL normalization
- HTML parsing
- API endpoints
- Database operations

## Database Schema

### search_results Table

```sql
CREATE TABLE search_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  search_history_id UUID NOT NULL REFERENCES search_history(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,  -- NEW COLUMN
  website TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for email searches
CREATE INDEX idx_search_results_email ON search_results(email) WHERE email IS NOT NULL;
```

## Performance Considerations

- **Memory**: Cheerio is lightweight, minimal memory usage
- **Network**: Respects rate limits, won't overwhelm servers
- **Database**: Indexed email column for fast queries
- **Scalability**: Can handle hundreds of results, but consider background jobs for thousands

## Security & Privacy

- ✅ Only extracts publicly available email addresses
- ✅ Respects robots.txt (future enhancement)
- ✅ User authentication required
- ✅ Row-level security on database
- ✅ No email validation/verification (to avoid privacy concerns)
- ✅ Emails stored encrypted at rest (Supabase default)

## Support

For issues or questions:
1. Check this guide
2. Review console logs for errors
3. Check Supabase logs for database issues
4. Verify network connectivity

---

**Built with:** Next.js, Axios, Cheerio, Supabase
**Created:** December 2024
**Version:** 1.0.0

