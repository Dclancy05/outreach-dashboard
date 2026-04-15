// ============================================================================
// ENHANCED SCRAPERS DESIGN - Workflow GZUSHxgbkgp62eoZ
// ============================================================================
// This file contains:
// 1. Updated "Code - Collect URLs" (full replacement)
// 2. Updated "Code - Match Results & Calculate Scores" (full replacement)
// 3. HTTP node configurations for 4 new enhanced scrapers
// 4. Merge node update (5 inputs -> 9 inputs)
// 5. Connection map for new nodes
// ============================================================================


// ============================================================================
// PART 1: UPDATED "Code - Collect URLs" (node id: collect_urls)
// ============================================================================
// Changes:
// - Reads enhanced_mode from webhook body (threaded through leads[0] or from
//   the webhook node directly via $('Webhook - Upload Leads'))
// - Collects place_ids for Google Reviews
// - Collects "business_name city" queries for Yelp
// - Collects website URLs for Website Crawler
// - Collects "business_type near address, city" queries for Competitor Lookup
// ============================================================================

const COLLECT_URLS_CODE = `
const leads = $input.all().map(item => item.json);

// Get enhanced_mode from the webhook body
const webhookData = $('Webhook - Upload Leads').first().json;
const webhookBody = webhookData.body || webhookData;
const enhancedMode = webhookBody.enhanced_mode === true || webhookBody.enhanced_mode === 'true';

const igUsernames = [];
const fbUrls = [];
const liCompanyUrls = [];

// Enhanced mode collections
const placeIds = [];
const yelpQueries = [];
const websiteUrls = [];
const competitorQueries = [];

leads.forEach((lead, index) => {
  if (lead.has_instagram && lead.instagram_url) {
    const username = lead.instagram_url.split('/').pop();
    if (username && !igUsernames.includes(username)) {
      igUsernames.push(username);
    }
  }

  if (lead.has_facebook && lead.facebook_url) {
    if (!fbUrls.includes(lead.facebook_url)) {
      fbUrls.push(lead.facebook_url);
    }
  }

  if (lead.is_linkedin_company && lead.linkedin_url) {
    if (!liCompanyUrls.includes(lead.linkedin_url)) {
      liCompanyUrls.push(lead.linkedin_url);
    }
  }

  // Enhanced mode: collect additional data points
  if (enhancedMode) {
    // Google Reviews: need place_id (lead_id is the place_id from Outscraper)
    if (lead.lead_id && lead.lead_id.startsWith('ChI')) {
      placeIds.push(lead.lead_id);
    }

    // Yelp: "business_name city" search query
    const leadName = (lead.name || '').trim();
    const leadCity = (lead.city || '').trim();
    if (leadName && leadCity) {
      const yelpQuery = leadName + ' ' + leadCity;
      if (!yelpQueries.includes(yelpQuery)) {
        yelpQueries.push(yelpQuery);
      }
    }

    // Website Crawler: lead's website URL
    const website = (lead.website || '').trim();
    if (website) {
      let normalizedUrl = website;
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      if (!websiteUrls.includes(normalizedUrl)) {
        websiteUrls.push(normalizedUrl);
      }
    }

    // Competitor Lookup: "business_type near address, city"
    const bizType = (lead.business_type || '').trim();
    const address = (lead.address || '').trim();
    if (bizType && (address || leadCity)) {
      const location = address || leadCity;
      const compQuery = bizType + ' near ' + location;
      if (!competitorQueries.includes(compQuery)) {
        competitorQueries.push(compQuery);
      }
    }
  }
});

return [{
  json: {
    leads: leads,
    igUsernames: igUsernames,
    fbUrls: fbUrls,
    liCompanyUrls: liCompanyUrls,
    totalLeads: leads.length,
    hasInstagram: igUsernames.length > 0,
    hasFacebook: fbUrls.length > 0,
    hasLinkedIn: liCompanyUrls.length > 0,
    // Enhanced mode fields
    enhancedMode: enhancedMode,
    placeIds: placeIds,
    yelpQueries: yelpQueries,
    websiteUrls: websiteUrls,
    competitorQueries: competitorQueries,
    hasPlaceIds: placeIds.length > 0,
    hasYelpQueries: yelpQueries.length > 0,
    hasWebsites: websiteUrls.length > 0,
    hasCompetitorQueries: competitorQueries.length > 0
  }
}];
`;


// ============================================================================
// PART 2: HTTP NODE CONFIGURATIONS FOR 4 NEW ENHANCED SCRAPERS
// ============================================================================

// ----------------------------------------------------------------------------
// Node 1: HTTP - Google Reviews (Outscraper)
// ----------------------------------------------------------------------------
// Position: [1100, 850] (below LinkedIn Posts at 700)
const GOOGLE_REVIEWS_NODE = {
  id: "scrape_google_reviews",
  name: "HTTP - Google Reviews",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1100, 850],
  parameters: {
    method: "POST",
    url: "https://api.outscraper.com/maps/reviews-v3",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    // When enhanced_mode is true AND we have place_ids, send real request.
    // Otherwise send a minimal request that returns empty.
    jsonBody: `={{ (() => {
  const d = $('Code - Collect URLs').first().json;
  if (d.enhancedMode && d.hasPlaceIds) {
    return JSON.stringify({
      query: d.placeIds,
      reviewsLimit: 5,
      sort: "newest",
      language: "en"
    });
  }
  return JSON.stringify({ query: ["skip_placeholder"], reviewsLimit: 0 });
})() }}`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: "X-API-KEY",
          value: "={{ $env.OUTSCRAPER_API_KEY }}"
        }
      ]
    },
    options: {
      timeout: 120000,
      response: {
        response: {
          neverError: true
        }
      }
    }
  },
  onError: "continueRegularOutput",
  alwaysOutputData: true
};

// ----------------------------------------------------------------------------
// Node 2: HTTP - Yelp Scraper (Apify)
// ----------------------------------------------------------------------------
// Position: [1100, 1000]
const YELP_SCRAPER_NODE = {
  id: "scrape_yelp",
  name: "HTTP - Scrape Yelp",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1100, 1000],
  parameters: {
    method: "POST",
    url: "=https://api.apify.com/v2/acts/tri_angle~yelp-scraper/run-sync-get-dataset-items?timeout=300",
    authentication: "genericCredentialType",
    genericAuthType: "httpQueryAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ (() => {
  const d = $('Code - Collect URLs').first().json;
  if (d.enhancedMode && d.hasYelpQueries) {
    return JSON.stringify({
      searchTerms: d.yelpQueries,
      maxItems: 1,
      includeReviews: false
    });
  }
  return JSON.stringify({ searchTerms: ["_skip_placeholder_"], maxItems: 0 });
})() }}`,
    options: {
      timeout: 300000,
      response: {
        response: {
          neverError: true
        }
      }
    }
  },
  credentials: {
    httpQueryAuth: {
      id: "OjVAH88VyRzZfz6P",
      name: "Apify API"
    }
  },
  onError: "continueRegularOutput",
  alwaysOutputData: true
};

// ----------------------------------------------------------------------------
// Node 3: HTTP - Website Crawler (Apify)
// ----------------------------------------------------------------------------
// Position: [1100, 1150]
const WEBSITE_CRAWLER_NODE = {
  id: "scrape_website",
  name: "HTTP - Crawl Websites",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1100, 1150],
  parameters: {
    method: "POST",
    url: "=https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?timeout=300",
    authentication: "genericCredentialType",
    genericAuthType: "httpQueryAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ (() => {
  const d = $('Code - Collect URLs').first().json;
  if (d.enhancedMode && d.hasWebsites) {
    return JSON.stringify({
      startUrls: d.websiteUrls.map(u => ({ url: u })),
      maxCrawlPages: 1,
      maxCrawlDepth: 0,
      crawlerType: "cheerio"
    });
  }
  return JSON.stringify({ startUrls: [{ url: "https://example.com" }], maxCrawlPages: 0 });
})() }}`,
    options: {
      timeout: 300000,
      response: {
        response: {
          neverError: true
        }
      }
    }
  },
  credentials: {
    httpQueryAuth: {
      id: "OjVAH88VyRzZfz6P",
      name: "Apify API"
    }
  },
  onError: "continueRegularOutput",
  alwaysOutputData: true
};

// ----------------------------------------------------------------------------
// Node 4: HTTP - Competitor Lookup (Outscraper)
// ----------------------------------------------------------------------------
// Position: [1100, 1300]
const COMPETITOR_LOOKUP_NODE = {
  id: "scrape_competitors",
  name: "HTTP - Competitor Lookup",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1100, 1300],
  parameters: {
    method: "POST",
    url: "https://api.outscraper.com/maps/search-v3",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ (() => {
  const d = $('Code - Collect URLs').first().json;
  if (d.enhancedMode && d.hasCompetitorQueries) {
    return JSON.stringify({
      query: d.competitorQueries,
      limit: 3,
      language: "en",
      region: "US"
    });
  }
  return JSON.stringify({ query: ["skip_placeholder"], limit: 0 });
})() }}`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: "X-API-KEY",
          value: "={{ $env.OUTSCRAPER_API_KEY }}"
        }
      ]
    },
    options: {
      timeout: 120000,
      response: {
        response: {
          neverError: true
        }
      }
    }
  },
  onError: "continueRegularOutput",
  alwaysOutputData: true
};


// ============================================================================
// PART 3: MERGE NODE UPDATE
// ============================================================================
// Change numberInputs from 5 to 9.
// Existing inputs 0-4 stay the same.
// New inputs:
//   index 5 = HTTP - Google Reviews
//   index 6 = HTTP - Scrape Yelp
//   index 7 = HTTP - Crawl Websites
//   index 8 = HTTP - Competitor Lookup
const MERGE_UPDATE = {
  numberInputs: 9  // was 5
};


// ============================================================================
// PART 4: NEW CONNECTIONS
// ============================================================================
// Add to "Code - Collect URLs" outputs (append to existing array):
//   -> HTTP - Google Reviews (index 0)
//   -> HTTP - Scrape Yelp (index 0)
//   -> HTTP - Crawl Websites (index 0)
//   -> HTTP - Competitor Lookup (index 0)
//
// Add new source connections:
//   HTTP - Google Reviews -> Merge - Scraper Results (index 5)
//   HTTP - Scrape Yelp -> Merge - Scraper Results (index 6)
//   HTTP - Crawl Websites -> Merge - Scraper Results (index 7)
//   HTTP - Competitor Lookup -> Merge - Scraper Results (index 8)


// ============================================================================
// PART 5: UPDATED "Code - Match Results & Calculate Scores"
// ============================================================================

const MATCH_AND_SCORE_CODE = `
const collectData = $('Code - Collect URLs').first().json;
const leads = collectData.leads;
const enhancedMode = collectData.enhancedMode || false;

// --- Existing scraper results (unchanged) ---
const igResults = $('HTTP - Scrape Instagram').all().map(i => i.json).filter(r => r && r.username);
const fbPageResults = $('HTTP - Scrape Facebook').all().map(i => i.json).filter(r => r && (r.pageUrl || r.url));
const fbPostResults = $('HTTP - Scrape Facebook Posts').all().map(i => i.json).filter(r => r && r.time);
const liCompanyResults = $('HTTP - Scrape LinkedIn').all().map(i => i.json).filter(r => r && !r.error && r.url);
const liPostResults = $('HTTP - Scrape LinkedIn Posts').all().map(i => i.json).filter(r => r && r.content);

// --- Enhanced scraper results (empty arrays if enhanced_mode is false) ---
let googleReviewResults = [];
let yelpResults = [];
let websiteResults = [];
let competitorResults = [];

if (enhancedMode) {
  try {
    googleReviewResults = $('HTTP - Google Reviews').all().map(i => i.json).filter(r => r && !r.error);
  } catch (e) { googleReviewResults = []; }
  try {
    yelpResults = $('HTTP - Scrape Yelp').all().map(i => i.json).filter(r => r && (r.name || r.bizName));
  } catch (e) { yelpResults = []; }
  try {
    websiteResults = $('HTTP - Crawl Websites').all().map(i => i.json).filter(r => r && (r.url || r.loadedUrl));
  } catch (e) { websiteResults = []; }
  try {
    competitorResults = $('HTTP - Competitor Lookup').all().map(i => i.json).filter(r => r && !r.error);
  } catch (e) { competitorResults = []; }
}

const now = new Date();
const threeMonthsAgo = new Date(now);
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

// --- Utility functions ---
function calculateScore(lastPostDate) {
  if (!lastPostDate) return 0;
  const postDate = new Date(lastPostDate);
  if (isNaN(postDate.getTime())) return 0;
  const daysDiff = Math.floor((now - postDate) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 30) return 3;
  if (daysDiff <= 120) return 2;
  return 1;
}

function formatPhone(phone) {
  if (!phone) return '';
  return phone.replace(/^\\+/, '');
}

// --- Existing map builders (unchanged) ---
function buildIgMap(results) {
  const map = {};
  results.forEach(r => {
    const username = (r.username || '').toLowerCase();
    if (username) map[username] = r;
  });
  return map;
}

function buildFbPageMap(results) {
  const map = {};
  results.forEach(r => {
    const url = (r.pageUrl || r.url || '').toLowerCase();
    const pageId = url.split('/').pop().split('?')[0];
    if (pageId) map[pageId] = r;
  });
  return map;
}

function buildFbPostsMap(results) {
  const map = {};
  results.forEach(r => {
    const pageName = (r.pageName || '').toLowerCase();
    if (pageName && !map[pageName]) map[pageName] = r;
    const fbUrl = (r.facebookUrl || r.inputUrl || '').toLowerCase();
    if (fbUrl) {
      const match = fbUrl.match(/facebook\\.com\\/([a-z0-9._-]+)/i);
      if (match && !map[match[1]]) map[match[1]] = r;
    }
  });
  return map;
}

function buildLiCompanyMap(results) {
  const map = {};
  results.forEach(r => {
    const url = (r.url || r.linkedInUrl || '').toLowerCase();
    const match = url.match(/company\\/([a-z0-9_-]+)/i);
    if (match) map[match[1]] = r;
  });
  return map;
}

function buildLiPostsMap(results) {
  const map = {};
  results.forEach(r => {
    const universalName = (r.author && r.author.universalName || '').toLowerCase();
    if (universalName && !map[universalName]) map[universalName] = r;
    const targetUrl = (r.query && r.query.targetUrl || '').toLowerCase();
    if (targetUrl) {
      const match = targetUrl.match(/company\\/([a-z0-9_-]+)/i);
      if (match && !map[match[1]]) map[match[1]] = r;
    }
  });
  return map;
}

// --- Enhanced map builders ---

// Google Reviews: Outscraper returns array of arrays (one per query/place_id).
// Flatten into a map keyed by place_id.
function buildGoogleReviewsMap(results) {
  const map = {};
  for (const item of results) {
    // Outscraper reviews-v3 returns data in different formats:
    // Could be { query: "...", reviews_data: [...] } or nested arrays
    if (item.place_id || item.google_id) {
      const key = item.place_id || item.google_id;
      if (!map[key]) map[key] = [];
      if (item.reviews_data && Array.isArray(item.reviews_data)) {
        map[key] = map[key].concat(item.reviews_data);
      } else if (item.review_text || item.review_rating) {
        map[key].push(item);
      }
    }
    // Handle nested structure: array of results per query
    if (Array.isArray(item)) {
      for (const sub of item) {
        if (sub.place_id || sub.google_id) {
          const key = sub.place_id || sub.google_id;
          if (!map[key]) map[key] = [];
          if (sub.reviews_data && Array.isArray(sub.reviews_data)) {
            map[key] = map[key].concat(sub.reviews_data);
          }
        }
      }
    }
    // Handle top-level reviews_data
    if (item.reviews_data && Array.isArray(item.reviews_data)) {
      for (const review of item.reviews_data) {
        const key = item.place_id || item.google_id || item.query || '';
        if (key) {
          if (!map[key]) map[key] = [];
          map[key].push(review);
        }
      }
    }
  }
  return map;
}

// Yelp: map by normalized business name
function buildYelpMap(results) {
  const map = {};
  for (const r of results) {
    const name = (r.name || r.bizName || '').toLowerCase().trim();
    if (name) map[name] = r;
    // Also map by search term if available
    const searchTerm = (r.searchTerm || r.query || '').toLowerCase().trim();
    if (searchTerm) map[searchTerm] = r;
  }
  return map;
}

// Website Crawler: map by domain
function buildWebsiteMap(results) {
  const map = {};
  for (const r of results) {
    const url = r.url || r.loadedUrl || '';
    if (url) {
      try {
        const domain = new URL(url).hostname.replace('www.', '').toLowerCase();
        map[domain] = r;
      } catch (e) {
        // If URL parsing fails, use raw url as key
        map[url.toLowerCase()] = r;
      }
    }
  }
  return map;
}

// Competitors: Outscraper search returns results grouped by query.
// Map by the search query string.
function buildCompetitorMap(results) {
  const map = {};
  for (const item of results) {
    const query = (item.query || '').toLowerCase().trim();
    if (query) {
      if (!map[query]) map[query] = [];
      map[query].push(item);
    }
    // Handle nested arrays from Outscraper
    if (Array.isArray(item)) {
      for (const sub of item) {
        const q = (sub.query || '').toLowerCase().trim();
        if (q) {
          if (!map[q]) map[q] = [];
          map[q].push(sub);
        }
      }
    }
  }
  return map;
}

// --- Website content analysis ---
function analyzeWebsiteContent(crawlData) {
  if (!crawlData) return { hasOnlineBooking: false, techPlatform: '', hasBlog: false, hasContactForm: false };

  const text = ((crawlData.text || crawlData.markdown || crawlData.html || '') + '').toLowerCase();
  const url = (crawlData.url || crawlData.loadedUrl || '').toLowerCase();

  // Detect online booking systems
  const bookingPatterns = [
    'book now', 'book online', 'schedule appointment', 'book appointment',
    'online booking', 'reserve now', 'make a reservation', 'schedule now',
    'calendly.com', 'acuityscheduling', 'squareup.com/appointments',
    'booksy.com', 'vagaro.com', 'mindbodyonline', 'schedulicity',
    'fresha.com', 'setmore', 'simplybook', 'square appointments',
    'jane.app', 'boulevard.io', 'zenoti.com', 'booker.com'
  ];
  const hasOnlineBooking = bookingPatterns.some(p => text.includes(p));

  // Detect tech platform / CMS
  let techPlatform = '';
  const platformChecks = [
    { pattern: 'wordpress', name: 'WordPress' },
    { pattern: 'wp-content', name: 'WordPress' },
    { pattern: 'wp-includes', name: 'WordPress' },
    { pattern: 'squarespace', name: 'Squarespace' },
    { pattern: 'wix.com', name: 'Wix' },
    { pattern: 'wixsite', name: 'Wix' },
    { pattern: 'shopify', name: 'Shopify' },
    { pattern: 'myshopify', name: 'Shopify' },
    { pattern: 'godaddy', name: 'GoDaddy' },
    { pattern: 'weebly', name: 'Weebly' },
    { pattern: 'webflow', name: 'Webflow' },
    { pattern: 'duda', name: 'Duda' },
    { pattern: 'jimdo', name: 'Jimdo' },
    { pattern: 'gatsby', name: 'Gatsby' },
    { pattern: 'next.js', name: 'Next.js' },
    { pattern: '__next', name: 'Next.js' },
    { pattern: 'framer', name: 'Framer' }
  ];
  for (const check of platformChecks) {
    if (text.includes(check.pattern) || url.includes(check.pattern)) {
      techPlatform = check.name;
      break;
    }
  }

  // Detect blog
  const blogPatterns = ['blog', '/blog', 'articles', 'news', 'latest posts', 'recent posts'];
  const hasBlog = blogPatterns.some(p => text.includes(p));

  // Detect contact form
  const contactPatterns = [
    'contact us', 'contact form', 'get in touch', 'send us a message',
    'send message', '<form', 'name="contact"', 'id="contact"'
  ];
  const hasContactForm = contactPatterns.some(p => text.includes(p));

  return { hasOnlineBooking, techPlatform, hasBlog, hasContactForm };
}

// --- Calculate Instagram engagement rate ---
function calculateIgEngagement(igData) {
  if (!igData || !igData.followersCount || igData.followersCount === 0) return 0;
  const posts = igData.latestPosts || [];
  if (posts.length === 0) return 0;
  let totalLikes = 0;
  let count = 0;
  for (const post of posts) {
    const likes = post.likesCount || post.likes || 0;
    totalLikes += likes;
    count++;
  }
  if (count === 0) return 0;
  const avgLikes = totalLikes / count;
  return Math.round((avgLikes / igData.followersCount) * 10000) / 100; // percentage with 2 decimals
}

// --- Extract owner name from LinkedIn ---
function extractOwnerName(liCompanyData) {
  if (!liCompanyData) return '';
  // Try various fields that LinkedIn company scrapers return
  if (liCompanyData.founderName) return liCompanyData.founderName;
  if (liCompanyData.ceo) return liCompanyData.ceo;
  if (liCompanyData.owner) return liCompanyData.owner;
  // Check affiliated members / people
  if (liCompanyData.affiliatedMembers && Array.isArray(liCompanyData.affiliatedMembers)) {
    const owner = liCompanyData.affiliatedMembers.find(m =>
      (m.title || '').toLowerCase().includes('owner') ||
      (m.title || '').toLowerCase().includes('founder') ||
      (m.title || '').toLowerCase().includes('ceo')
    );
    if (owner) return owner.name || owner.fullName || '';
  }
  if (liCompanyData.people && Array.isArray(liCompanyData.people)) {
    const owner = liCompanyData.people.find(m =>
      (m.title || '').toLowerCase().includes('owner') ||
      (m.title || '').toLowerCase().includes('founder') ||
      (m.title || '').toLowerCase().includes('ceo')
    );
    if (owner) return owner.name || owner.fullName || '';
  }
  return '';
}

// --- Calculate review velocity (reviews in last 3 months) ---
function calculateReviewVelocity(reviews) {
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) return 0;
  let recentCount = 0;
  for (const review of reviews) {
    const dateStr = review.review_datetime_utc || review.date || review.datetime || review.timestamp || '';
    if (!dateStr) continue;
    const reviewDate = new Date(dateStr);
    if (!isNaN(reviewDate.getTime()) && reviewDate >= threeMonthsAgo) {
      recentCount++;
    }
  }
  return recentCount;
}

// --- Calculate posting frequency across platforms ---
function calculatePostingFrequency(igData, fbPosts, liPosts) {
  const allDates = [];

  // Instagram posts
  if (igData && igData.latestPosts) {
    for (const post of igData.latestPosts) {
      const d = post.timestamp || post.date || '';
      if (d) {
        const pd = new Date(d);
        if (!isNaN(pd.getTime())) allDates.push(pd);
      }
    }
  }

  // Facebook posts - collect from all matching posts
  if (fbPosts && Array.isArray(fbPosts)) {
    for (const post of fbPosts) {
      const d = post.time || post.date || post.timestamp || '';
      if (d) {
        const pd = new Date(d);
        if (!isNaN(pd.getTime())) allDates.push(pd);
      }
    }
  } else if (fbPosts && (fbPosts.time || fbPosts.date)) {
    const d = fbPosts.time || fbPosts.date || '';
    const pd = new Date(d);
    if (!isNaN(pd.getTime())) allDates.push(pd);
  }

  // LinkedIn posts
  if (liPosts && Array.isArray(liPosts)) {
    for (const post of liPosts) {
      let d = '';
      if (post.postedAt && post.postedAt.date) d = post.postedAt.date;
      else if (post.postedAt && post.postedAt.timestamp) d = new Date(post.postedAt.timestamp).toISOString();
      else d = post.date || post.timestamp || '';
      if (d) {
        const pd = new Date(d);
        if (!isNaN(pd.getTime())) allDates.push(pd);
      }
    }
  } else if (liPosts && (liPosts.content || liPosts.text)) {
    let d = '';
    if (liPosts.postedAt && liPosts.postedAt.date) d = liPosts.postedAt.date;
    else d = liPosts.date || liPosts.timestamp || '';
    if (d) {
      const pd = new Date(d);
      if (!isNaN(pd.getTime())) allDates.push(pd);
    }
  }

  if (allDates.length < 2) return allDates.length > 0 ? 'low' : 'none';

  allDates.sort((a, b) => b - a);
  const newest = allDates[0];
  const oldest = allDates[allDates.length - 1];
  const spanDays = Math.max(1, Math.floor((newest - oldest) / (1000 * 60 * 60 * 24)));
  const postsPerWeek = (allDates.length / spanDays) * 7;

  if (postsPerWeek >= 5) return 'daily';
  if (postsPerWeek >= 2) return 'several_per_week';
  if (postsPerWeek >= 0.8) return 'weekly';
  if (postsPerWeek >= 0.25) return 'monthly';
  return 'low';
}

// --- Build all maps ---
const igMap = buildIgMap(igResults);
const fbPageMap = buildFbPageMap(fbPageResults);
const fbPostsMap = buildFbPostsMap(fbPostResults);
const liCompanyMap = buildLiCompanyMap(liCompanyResults);
const liPostsMap = buildLiPostsMap(liPostResults);

// Enhanced maps
const googleReviewsMap = enhancedMode ? buildGoogleReviewsMap(googleReviewResults) : {};
const yelpMap = enhancedMode ? buildYelpMap(yelpResults) : {};
const websiteMap = enhancedMode ? buildWebsiteMap(websiteResults) : {};
const competitorMap = enhancedMode ? buildCompetitorMap(competitorResults) : {};

// --- Score each lead ---
const scoredLeads = leads.map(lead => {
  // ---- Existing: Instagram matching ----
  let igData = null;
  if (lead.has_instagram && lead.instagram_url) {
    const username = lead.instagram_url.split('/').pop().toLowerCase();
    igData = igMap[username];
  }

  // ---- Existing: Facebook matching ----
  let fbPageData = null, fbPostData = null;
  if (lead.has_facebook && lead.facebook_url) {
    const pageId = lead.facebook_url.toLowerCase().split('/').pop().split('?')[0];
    fbPageData = fbPageMap[pageId];
    fbPostData = fbPostsMap[pageId];
  }

  // ---- Existing: LinkedIn matching ----
  let liCompanyData = null, liPostData = null;
  if (lead.is_linkedin_company && lead.linkedin_url) {
    const match = lead.linkedin_url.toLowerCase().match(/company\\/([a-z0-9_-]+)/i);
    if (match) {
      liCompanyData = liCompanyMap[match[1]];
      liPostData = liPostsMap[match[1]];
    }
  }

  // ---- Existing: Extract Instagram data ----
  let igFollowers = 0, igBio = '', igLastPostDate = '', igLastCaption = '', igPostsCount = 0;
  if (igData) {
    igFollowers = igData.followersCount || 0;
    igBio = igData.biography || '';
    igPostsCount = igData.postsCount || 0;
    if (igData.latestPosts && igData.latestPosts[0]) {
      igLastPostDate = igData.latestPosts[0].timestamp || '';
      igLastCaption = igData.latestPosts[0].caption || '';
    }
  }

  // ---- Existing: Extract Facebook data ----
  let fbFollowers = 0, fbLikes = 0, fbAbout = '', fbCategories = '';
  if (fbPageData) {
    fbFollowers = fbPageData.followers || 0;
    fbLikes = fbPageData.likes || 0;
    fbAbout = fbPageData.about || '';
    fbCategories = Array.isArray(fbPageData.categories) ? fbPageData.categories.join(', ') : (fbPageData.categories || '');
  }

  let fbLastPostDate = '', fbLastPostText = '';
  if (fbPostData) {
    fbLastPostDate = fbPostData.time || '';
    fbLastPostText = fbPostData.text || fbPostData.message || '';
  }

  // ---- Existing: Extract LinkedIn data ----
  let liFollowers = 0, liDescription = '', liIndustry = '', liEmployeeCount = '';
  if (liCompanyData) {
    liFollowers = liCompanyData.followerCount || liCompanyData.followersCount || liCompanyData.followers || 0;
    liDescription = liCompanyData.description || liCompanyData.about || liCompanyData.tagline || '';
    liIndustry = liCompanyData.industry || liCompanyData.industryV2Taxonomy || '';
    liEmployeeCount = liCompanyData.employeeCount || liCompanyData.staffCount || liCompanyData.companySize || '';
    if (typeof liEmployeeCount === 'object' && liEmployeeCount.start) {
      liEmployeeCount = liEmployeeCount.start + '-' + (liEmployeeCount.end || '+');
    }
  }

  let liLastPostDate = '', liLastPostText = '';
  if (liPostData) {
    if (liPostData.postedAt) {
      liLastPostDate = liPostData.postedAt.date || (liPostData.postedAt.timestamp ? new Date(liPostData.postedAt.timestamp).toISOString() : '');
    } else {
      liLastPostDate = liPostData.date || liPostData.timestamp || '';
    }
    liLastPostText = liPostData.content || liPostData.text || '';
  }

  // ---- Existing: Calculate scores ----
  const igScore = lead.has_instagram ? calculateScore(igLastPostDate) : 0;
  const fbScore = lead.has_facebook ? calculateScore(fbLastPostDate) : 0;
  const liScore = lead.is_linkedin_company ? calculateScore(liLastPostDate) : 0;
  const totalScore = igScore + fbScore + liScore;

  let rankingTier = 'COLD';
  if (totalScore >= 6) rankingTier = 'HOT';
  else if (totalScore >= 3) rankingTier = 'WARM';

  // ============================================================
  // ENHANCED MODE: Parse new scraper data
  // ============================================================

  // --- Google Reviews ---
  let googleReviewSnippets = [];
  let reviewVelocity = 0;
  if (enhancedMode) {
    const placeId = lead.lead_id;
    const reviews = googleReviewsMap[placeId] || [];
    if (reviews.length > 0) {
      googleReviewSnippets = reviews.slice(0, 3).map(r => ({
        text: (r.review_text || r.text || r.body || '').substring(0, 300),
        rating: r.review_rating || r.rating || r.stars || 0,
        author: ((r.author_title || r.author_name || r.reviewer_name || r.author || '').split(' ')[0]) || 'Anonymous'
      }));
      reviewVelocity = calculateReviewVelocity(reviews);
    }
  }

  // --- Yelp ---
  let yelpRating = 0, yelpReviewCount = 0, yelpCategories = '';
  if (enhancedMode) {
    const leadNameLower = (lead.name || '').toLowerCase().trim();
    const leadCity = (lead.city || '').toLowerCase().trim();
    const yelpSearchKey = (leadNameLower + ' ' + leadCity).trim();
    // Try matching by search term first, then by name
    const yelpData = yelpMap[yelpSearchKey] || yelpMap[leadNameLower] || null;
    if (yelpData) {
      yelpRating = parseFloat(yelpData.rating || yelpData.bizRating || 0) || 0;
      yelpReviewCount = parseInt(yelpData.reviewCount || yelpData.bizReviewCount || 0) || 0;
      const cats = yelpData.categories || yelpData.bizCategories || [];
      yelpCategories = Array.isArray(cats) ? cats.map(c => typeof c === 'object' ? (c.title || c.name || '') : c).join(', ') : String(cats);
    }
  }

  // --- Website Analysis ---
  let websiteAnalysis = { hasOnlineBooking: false, techPlatform: '', hasBlog: false, hasContactForm: false };
  if (enhancedMode) {
    const website = (lead.website || '').trim();
    if (website) {
      let domain = '';
      try {
        let normalizedUrl = website;
        if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;
        domain = new URL(normalizedUrl).hostname.replace('www.', '').toLowerCase();
      } catch (e) {
        domain = website.replace(/^https?:\\/\\/(www\\.)?/, '').split('/')[0].toLowerCase();
      }
      const crawlData = websiteMap[domain] || null;
      websiteAnalysis = analyzeWebsiteContent(crawlData);
    }
  }

  // --- Competitors ---
  let competitorData = [];
  if (enhancedMode) {
    const bizType = (lead.business_type || '').trim().toLowerCase();
    const address = (lead.address || '').trim().toLowerCase();
    const city = (lead.city || '').trim().toLowerCase();
    const location = address || city;
    const compKey = (bizType + ' near ' + location).trim();
    const compResults = competitorMap[compKey] || [];
    // Filter out the lead itself, take top 3
    competitorData = compResults
      .filter(c => {
        const compName = (c.name || '').toLowerCase();
        const leadName = (lead.name || '').toLowerCase();
        return compName !== leadName;
      })
      .slice(0, 3)
      .map(c => ({
        name: c.name || '',
        rating: parseFloat(c.rating || 0) || 0,
        review_count: parseInt(c.reviews || c.reviews_count || 0) || 0
      }));
  }

  // --- Instagram Engagement Rate ---
  const igEngagementRate = calculateIgEngagement(igData);

  // --- Owner Name from LinkedIn ---
  const ownerName = extractOwnerName(liCompanyData);

  // --- Posting Frequency ---
  // Collect all FB posts for this lead
  let allFbPosts = [];
  if (lead.has_facebook && lead.facebook_url) {
    const pageId = lead.facebook_url.toLowerCase().split('/').pop().split('?')[0];
    allFbPosts = fbPostResults.filter(r => {
      const fbUrl = (r.facebookUrl || r.inputUrl || '').toLowerCase();
      const match = fbUrl.match(/facebook\\.com\\/([a-z0-9._-]+)/i);
      return (match && match[1] === pageId) || (r.pageName || '').toLowerCase() === pageId;
    });
  }
  // Collect all LI posts for this lead
  let allLiPosts = [];
  if (lead.is_linkedin_company && lead.linkedin_url) {
    const liMatch = lead.linkedin_url.toLowerCase().match(/company\\/([a-z0-9_-]+)/i);
    if (liMatch) {
      allLiPosts = liPostResults.filter(r => {
        const universalName = (r.author && r.author.universalName || '').toLowerCase();
        const targetUrl = (r.query && r.query.targetUrl || '').toLowerCase();
        const tMatch = targetUrl.match(/company\\/([a-z0-9_-]+)/i);
        return universalName === liMatch[1] || (tMatch && tMatch[1] === liMatch[1]);
      });
    }
  }
  const postingFrequency = calculatePostingFrequency(igData, allFbPosts, allLiPosts);

  // ============================================================
  // Build _raw_scrape_data JSON
  // ============================================================
  const rawScrapeData = JSON.stringify({
    // Existing fields
    ig_followers: igFollowers,
    ig_bio: (igBio || '').substring(0, 500),
    ig_posts_count: igPostsCount,
    ig_last_post: igLastPostDate,
    ig_last_caption: (igLastCaption || '').substring(0, 200),
    ig_score: igScore,
    ig_engagement_rate: igEngagementRate,
    fb_followers: fbFollowers,
    fb_likes: fbLikes,
    fb_about: (fbAbout || '').substring(0, 500),
    fb_categories: (fbCategories || '').substring(0, 200),
    fb_last_post: fbLastPostDate,
    fb_last_post_text: (fbLastPostText || '').substring(0, 200),
    fb_score: fbScore,
    li_followers: liFollowers,
    li_description: (liDescription || '').substring(0, 500),
    li_industry: liIndustry || '',
    li_employee_count: liEmployeeCount || '',
    li_last_post: liLastPostDate,
    li_last_post_text: (liLastPostText || '').substring(0, 200),
    li_score: liScore,
    address: lead.address || '',
    google_rating: lead.google_rating || '',
    google_review_count: lead.google_review_count || '',
    phone_type: lead.phone_type || '',
    linkedin_type: lead.linkedin_type || '',
    // New enhanced fields
    owner_name: ownerName,
    ig_engagement_rate_pct: igEngagementRate,
    posting_frequency: postingFrequency,
    review_velocity_3mo: reviewVelocity,
    google_review_snippets: googleReviewSnippets,
    yelp_rating: yelpRating,
    yelp_review_count: yelpReviewCount,
    yelp_categories: yelpCategories,
    website_has_online_booking: websiteAnalysis.hasOnlineBooking,
    website_tech_platform: websiteAnalysis.techPlatform,
    website_has_blog: websiteAnalysis.hasBlog,
    website_has_contact_form: websiteAnalysis.hasContactForm,
    competitors: competitorData,
    enhanced_mode: enhancedMode
  });

  return {
    json: {
      lead_id: lead.lead_id,
      name: lead.name,
      city: lead.city,
      state: lead.state,
      business_type: lead.business_type || '',
      phone: formatPhone(lead.phone),
      email: lead.email || '',
      website: lead.website || '',
      instagram_url: lead.instagram_url || '',
      facebook_url: lead.facebook_url || '',
      linkedin_url: lead.linkedin_url || '',
      total_score: totalScore,
      ranking_tier: rankingTier,
      status: 'new',
      sequence_id: '',
      current_step: '',
      next_action_date: '',
      last_platform_sent: '',
      scraped_at: now.toISOString(),
      messages_generated: 'FALSE',
      notes: '',
      _raw_scrape_data: rawScrapeData
    }
  };
});

return scoredLeads;
`;


// ============================================================================
// SUMMARY OF ALL CHANGES
// ============================================================================
//
// 1. "Code - Collect URLs" - REPLACE jsCode with COLLECT_URLS_CODE
//    - Adds: enhancedMode, placeIds, yelpQueries, websiteUrls, competitorQueries
//    - All existing fields preserved
//
// 2. "Merge - Scraper Results" - Change numberInputs from 5 to 9
//
// 3. Four new HTTP Request nodes:
//    - "HTTP - Google Reviews"      -> Merge index 5
//    - "HTTP - Scrape Yelp"         -> Merge index 6
//    - "HTTP - Crawl Websites"      -> Merge index 7
//    - "HTTP - Competitor Lookup"   -> Merge index 8
//
// 4. New connections from "Code - Collect URLs" to each new scraper
//
// 5. "Code - Match Results & Calculate Scores" - REPLACE jsCode with MATCH_AND_SCORE_CODE
//    - All existing matching logic unchanged
//    - Adds: Google review snippet parsing, Yelp data, website analysis,
//      competitor data, engagement rate, owner name, review velocity,
//      posting frequency
//    - All new data stored in _raw_scrape_data JSON
