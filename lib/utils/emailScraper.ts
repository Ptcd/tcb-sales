import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Email regex pattern for matching email addresses
 * Matches most common email formats
 */
const EMAIL_REGEX =
  /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

/**
 * Industry-specific email patterns to prioritize
 * Common patterns for junk car/auto businesses
 */
const INDUSTRY_EMAIL_PATTERNS = [
  /info@/i,
  /contact@/i,
  /sales@/i,
  /quote@/i,
  /estimate@/i,
  /service@/i,
  /admin@/i,
  /support@/i,
  /business@/i,
  /office@/i,
];

/**
 * Common patterns to exclude (not real emails)
 */
const EXCLUDED_PATTERNS = [
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.svg$/i,
  /example\.com$/i,
  /domain\.com$/i,
  /yoursite\.com$/i,
  /yourdomain\.com$/i,
  /sitelock\.com$/i,
  /@2x\./i,
  /wixpress\.com$/i,
  /schema\.org$/i,
];

/**
 * Common contact page URL patterns
 * Enhanced for junk car/auto industry
 */
const CONTACT_PAGE_PATTERNS = [
  "/contact",
  "/contact-us",
  "/contactus",
  "/about",
  "/about-us",
  "/get-in-touch",
  "/quote",
  "/get-quote",
  "/estimate",
  "/free-quote",
  "/call-now",
  "/contact-us-today",
  "/get-started",
  "/services",
  "/locations",
];

/**
 * Validates if a string is a real email address
 */
function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;

  // Check against excluded patterns
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(email)) return false;
  }

  // Basic validation
  const parts = email.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain) return false;

  // Domain should have at least one dot
  if (!domain.includes(".")) return false;

  return true;
}

/**
 * Extracts emails from HTML content
 * Prioritizes industry-specific email patterns
 */
function extractEmailsFromHTML(html: string): string[] {
  const emails = new Set<string>();
  const industryEmails = new Set<string>();
  const matches = html.match(EMAIL_REGEX);

  if (matches) {
    for (const match of matches) {
      const email = match.toLowerCase().trim();
      if (isValidEmail(email)) {
        // Check if it matches industry patterns
        const isIndustryEmail = INDUSTRY_EMAIL_PATTERNS.some(pattern => pattern.test(email));
        
        if (isIndustryEmail) {
          industryEmails.add(email);
        } else {
          emails.add(email);
        }
      }
    }
  }

  // Return industry emails first, then others
  return [...Array.from(industryEmails), ...Array.from(emails)];
}

/**
 * Attempts to fetch and parse a webpage for email addresses
 */
async function fetchPageEmails(
  url: string,
  timeout: number = 8000
): Promise<string[]> {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.data) {
      const $ = cheerio.load(response.data);

      // Remove script and style tags
      $("script, style, noscript").remove();

      // Get text content and HTML for email extraction
      const textContent = $.text();
      const htmlContent = $.html();

      // Extract emails from both text and HTML
      const emailsFromText = extractEmailsFromHTML(textContent);
      const emailsFromHTML = extractEmailsFromHTML(htmlContent);

      // Also check mailto links
      const mailtoLinks = $('a[href^="mailto:"]')
        .map((_, el) => {
          const href = $(el).attr("href");
          if (href) {
            return href.replace("mailto:", "").split("?")[0].toLowerCase();
          }
          return null;
        })
        .get()
        .filter((email): email is string => email !== null && isValidEmail(email));

      // Combine all emails
      const allEmails = new Set([
        ...emailsFromText,
        ...emailsFromHTML,
        ...mailtoLinks,
      ]);

      return Array.from(allEmails);
    }
  } catch (error) {
    // Silently fail for individual page errors
    console.error(`Error fetching ${url}:`, error instanceof Error ? error.message : "Unknown error");
  }

  return [];
}

/**
 * Normalizes a URL to ensure it has proper protocol
 */
function normalizeURL(url: string): string {
  if (!url) return "";

  // Remove whitespace
  url = url.trim();

  // Add https:// if no protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  // Remove trailing slash
  url = url.replace(/\/$/, "");

  return url;
}

/**
 * Gets potential contact page URLs from a base URL
 */
function getContactPageURLs(baseUrl: string): string[] {
  try {
    const normalized = normalizeURL(baseUrl);
    const url = new URL(normalized);
    const base = url.origin;

    return CONTACT_PAGE_PATTERNS.map((pattern) => `${base}${pattern}`);
  } catch (error) {
    return [];
  }
}

/**
 * Main function to scrape email from a business website
 * Tries homepage first, then common contact pages
 */
export async function scrapeEmailFromWebsite(
  websiteUrl: string,
  options: {
    timeout?: number;
    maxPages?: number;
  } = {}
): Promise<string | null> {
  if (!websiteUrl) return null;

  const { timeout = 8000, maxPages = 3 } = options;

  try {
    const normalizedUrl = normalizeURL(websiteUrl);
    const emails: string[] = [];

    // Try homepage first
    console.log(`Scraping email from: ${normalizedUrl}`);
    const homepageEmails = await fetchPageEmails(normalizedUrl, timeout);
    emails.push(...homepageEmails);

    // If we found emails on homepage, return the first one
    if (emails.length > 0) {
      console.log(`Found ${emails.length} email(s) on homepage`);
      return emails[0];
    }

    // Try contact pages
    const contactPages = getContactPageURLs(normalizedUrl).slice(0, maxPages - 1);

    for (const contactPageUrl of contactPages) {
      const contactEmails = await fetchPageEmails(contactPageUrl, timeout);
      emails.push(...contactEmails);

      if (emails.length > 0) {
        console.log(`Found ${emails.length} email(s) on ${contactPageUrl}`);
        return emails[0];
      }

      // Small delay between requests to be respectful
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`No emails found for ${normalizedUrl}`);
    return null;
  } catch (error) {
    console.error(
      `Error scraping email from ${websiteUrl}:`,
      error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}

/**
 * Batch scrape emails from multiple websites
 * Processes them with concurrency control
 */
export async function batchScrapeEmails(
  websites: string[],
  options: {
    concurrency?: number;
    timeout?: number;
    maxPages?: number;
  } = {}
): Promise<Map<string, string | null>> {
  const { concurrency = 5, timeout = 8000, maxPages = 3 } = options;
  const results = new Map<string, string | null>();

  // Process in batches
  for (let i = 0; i < websites.length; i += concurrency) {
    const batch = websites.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (website) => {
        const email = await scrapeEmailFromWebsite(website, {
          timeout,
          maxPages,
        });
        return { website, email };
      })
    );

    // Store results
    for (const { website, email } of batchResults) {
      results.set(website, email);
    }

    // Small delay between batches
    if (i + concurrency < websites.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

