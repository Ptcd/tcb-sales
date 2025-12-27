"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, Hash, ArrowRight, Mail } from "lucide-react";
import LocationAutocomplete from "./LocationAutocomplete";
import Input from "./Input";
import Button from "./Button";
import { Card, CardContent, CardHeader } from "./Card";

interface SearchFormProps {
  onSearch: (keyword: string, location: string, resultCount: number, enableEmailScraping?: boolean) => void;
  isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [resultCount, setResultCount] = useState(20);
  const [enableEmailScraping, setEnableEmailScraping] = useState(false);
  const [emailScrapingEnabled, setEmailScrapingEnabled] = useState(true);

  // Check if email scraping is enabled for the organization
  useEffect(() => {
    fetch("/api/settings/organization")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          setEmailScrapingEnabled(data.settings.enable_email_scraping !== false);
        }
      })
      .catch(() => {
        // Default to enabled if check fails
        setEmailScrapingEnabled(true);
      });
  }, []);

  const resultCountOptions = [
    { value: 10, label: "10 results" },
    { value: 20, label: "20 results" },
    { value: 50, label: "50 results" },
    { value: 100, label: "100 results" },
    { value: 200, label: "200 results" },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyword.trim() && location.trim()) {
      onSearch(keyword.trim(), location.trim(), resultCount, enableEmailScraping);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-4 items-end"
      >
        {/* Business Type Field */}
        <div className="flex-1 min-w-0">
          <Input
            label="Business Type"
            placeholder="restaurant, dentist, auto repair..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            required
            disabled={isLoading}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Location Field */}
        <div className="flex-1 min-w-0">
          <div>
            <label className="block text-xs font-semibold text-gray-800 mb-1">
              Location
            </label>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="Chicago, IL or 60601"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Results Count */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-semibold text-gray-800 mb-2">
            Results
          </label>
          <div className="flex flex-wrap gap-1">
            {resultCountOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setResultCount(option.value)}
                disabled={isLoading}
                className={`px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all duration-200 ${
                  resultCount === option.value
                    ? "border-slate-500 bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-lg"
                    : "border-gray-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.value}
              </button>
            ))}
          </div>
        </div>

        {/* Search Button */}
        <div className="flex-shrink-0">
          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            loading={isLoading}
            leftIcon={<Search className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </div>
      </form>

      {/* Email Scraping Toggle */}
      {emailScrapingEnabled && (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="email-scraping"
            checked={enableEmailScraping}
            onChange={(e) => setEnableEmailScraping(e.target.checked)}
            disabled={isLoading}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="email-scraping"
            className="text-sm text-gray-700 flex items-center gap-1 cursor-pointer"
          >
            <Mail className="w-4 h-4" />
            Also scrape emails (slower search)
          </label>
        </div>
      )}
    </div>
  );
}
