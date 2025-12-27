# 🐛 Troubleshooting Guide

## **403 Error - Google Maps API Access Denied**

### **Common Causes & Solutions:**

#### **1. API Not Enabled**

**Problem**: The required APIs are not enabled in Google Cloud Console.

**Solution**:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to **APIs & Services → Library**
4. Enable these APIs:
   - ✅ **Places API (new)**
   - ✅ **Geocoding API**
5. Wait 2-3 minutes for activation

#### **2. API Key Restrictions**

**Problem**: API key has restrictions that block your requests.

**Solution**:

1. Go to **APIs & Services → Credentials**
2. Click on your API key
3. Under **API restrictions**:
   - Select **Restrict key**
   - Choose **Select APIs**
   - Add: **Places API (new)** and **Geocoding API**
4. Under **Application restrictions**:
   - Choose **None** (for development)
   - Or add your server IP addresses for production

#### **3. Billing Not Enabled**

**Problem**: Google Maps APIs require billing to be enabled.

**Solution**:

1. Go to **Billing** in Google Cloud Console
2. Link a payment method
3. Note: You get $200 free credit per month

#### **4. Invalid API Key**

**Problem**: API key is incorrect or malformed.

**Solution**:

1. Verify your API key in `.env.local`:
   ```bash
   GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
2. API keys should be 20-50 characters long
3. Contains only alphanumeric characters, hyphens, and underscores
4. Check for typos or extra spaces
5. Ensure no quotes or special characters around the key

---

## **Security Fixes Applied**

### **1. URL Parsing Security Issue**

- ✅ Fixed deprecation warning for `url.parse()`
- ✅ Added proper error handling for API responses
- ✅ Implemented input validation

### **2. API Key Validation**

- ✅ Added format validation for Google API keys
- ✅ Better error messages for debugging
- ✅ Secure error logging

### **3. Rate Limiting Protection**

- ✅ Added delays between API requests (Google requirement)
- ✅ Proper timeout handling
- ✅ Quota limit detection

---

## **Quick Fix Commands**

### **Check Your Setup:**

```bash
# 1. Verify environment variables
npm run supabase:status

# 2. Check API key format
echo $GOOGLE_MAPS_API_KEY

# 3. Test with a simple search
# Use small result count first (10-20 results)
```

### **Enable Required APIs:**

1. **Places API (new)** - For business search
2. **Geocoding API** - For location processing

### **Test API Access:**

```bash
# Test with curl (replace YOUR_API_KEY)
curl "https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants+in+New+York&key=YOUR_API_KEY"
```

---

## **Error Messages Explained**

| Error                | Cause                             | Solution                        |
| -------------------- | --------------------------------- | ------------------------------- |
| `403 REQUEST_DENIED` | API not enabled or key restricted | Enable APIs, check restrictions |
| `OVER_QUERY_LIMIT`   | Quota exceeded                    | Wait or upgrade billing         |
| `INVALID_REQUEST`    | Bad search parameters             | Check keyword/location format   |
| `ZERO_RESULTS`       | No businesses found               | Try different location/keyword  |

---

## **Production Security Checklist**

- ✅ API key stored in environment variables only
- ✅ API restrictions configured properly
- ✅ Billing alerts set up
- ✅ Rate limiting implemented
- ✅ Error handling prevents information leakage
- ✅ Input validation on all user inputs

---

## **Still Having Issues?**

1. **Check Google Cloud Console** → APIs & Services → Dashboard
2. **Verify billing** is enabled and active
3. **Test API key** with curl command above
4. **Check quotas** in Google Cloud Console
5. **Wait 5-10 minutes** after making changes

**The 403 error is usually resolved by enabling the required APIs and configuring API key restrictions properly.**
