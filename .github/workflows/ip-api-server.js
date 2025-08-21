require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// --- simple in-memory cache + rate limit ---
const cache = new Map(); // key: ip -> { data, expiresAt }
const hits = new Map();  // key: clientId -> { count, windowStart }

const TTL = (parseInt(process.env.CACHE_TTL_HOURS || '12', 10)) * 60 * 60 * 1000; // default 12h
const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '120', 10);

// util: basic per-minute rate limit by client IP
function checkRate(req) {
  const id = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const now = Date.now();
  const rec = hits.get(id) || { count: 0, windowStart: now };
  if (now - rec.windowStart >= 60_000) { // new minute window
    rec.count = 0;
    rec.windowStart = now;
  }
  rec.count += 1;
  hits.set(id, rec);
  return rec.count <= RATE_LIMIT_PER_MIN;
}

// util: naive public-IP check (avoid RFC1918/local)
function isPublicIp(ip) {
  if (!ip) return false;
  const clean = ip.replace('::ffff:', '');
  return !/^10\.|^127\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\.|^::1$|^fc00:|^fe80:/i.test(clean);
}

// choose client IP from headers/XFF
function getClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = xff || req.ip || req.connection?.remoteAddress || '';
  return raw.replace('::ffff:', '');
}

// normalize FreeIPAPI → common schema
function normalizeFreeIPAPI(obj) {
  return {
    source: 'freeipapi',
    ip: obj.ipAddress || null,
    city: obj.cityName || null,
    region: obj.regionName || null,
    country: obj.countryName || null,
    country_code: obj.countryCode || null,
    lat: obj.latitude ?? null,
    lon: obj.longitude ?? null,
    timezone: Array.isArray(obj.timeZones) ? obj.timeZones[0] : null,
    postal: obj.zipCode || null,
    asn: obj.asn || null,
    org: obj.asnOrganization || null,
    currency: Array.isArray(obj.currencies) ? obj.currencies[0] : null,
    is_proxy: obj.isProxy ?? null
  };
}

// normalize ipgeolocation.io → common schema
function normalizeIPGeo(obj) {
  const loc = obj.location || {};
  const net = obj.network || {};
  const asn = net.asn || {};
  const tz  = obj.time_zone || {};
  const cur = obj.currency || {};
  return {
    source: 'ipgeolocation',
    ip: obj.ip || null,
    city: loc.city || null,
    region: loc.state_prov || null,
    country: loc.country_name || null,
    country_code: loc.country_code2 || null,
    lat: loc.latitude != null ? Number(loc.latitude) : null,
    lon: loc.longitude != null ? Number(loc.longitude) : null,
    timezone: tz.name || null,
    postal: loc.zipcode || null,
    asn: asn.as_number || null,
    org: asn.organization || (obj.company && obj.company.name) || null,
    currency: cur.code || null,
    is_proxy: (obj.security && typeof obj.security.is_proxy === 'boolean') ? obj.security.is_proxy : null
  };
}

async function fetchFreeIPAPI(ip) {
  // FreeIPAPI prefers /{ip}; if not public, let it 404 and we'll failover
  const base = 'https://free.freeipapi.com/api/json';
  const url = isPublicIp(ip) ? `${base}/${encodeURIComponent(ip)}` : `${base}/${encodeURIComponent('1.1.1.1')}`;
  
  try {
    const res = await fetch(url, { 
      headers: { 'accept': 'application/json' }, 
      redirect: 'follow',
      timeout: 10000
    });

    if (!res.ok) throw new Error(`freeipapi status ${res.status}`);
    const data = await res.json();
    const obj = Array.isArray(data) ? data[0] : data;
    if (!obj || (obj.latitude == null && obj.longitude == null)) throw new Error('freeipapi missing coords');
    return normalizeFreeIPAPI(obj);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] FreeIPAPI failed for IP: ${ip} - ${error.message}`);
    throw error;
  }
}

async function fetchIPGeolocation(ip) {
  const key = process.env.IPGEO_KEY;
  if (!key) throw new Error('missing IPGEO_KEY');
  const params = new URLSearchParams({ apiKey: key });
  if (isPublicIp(ip)) params.set('ip', ip);
  const url = `https://api.ipgeolocation.io/v2/ipgeo?${params.toString()}`;
  
  try {
    const res = await fetch(url, { 
      headers: { 'accept': 'application/json' },
      timeout: 10000
    });
    if (!res.ok) throw new Error(`ipgeolocation status ${res.status}`);
    const data = await res.json();
    if (!(data.location && data.location.latitude && data.location.longitude)) throw new Error('ipgeolocation missing coords');
    return normalizeIPGeo(data);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] IPGeolocation failed for IP: ${ip} - ${error.message}`);
    throw error;
  }
}

// GET /ipinfo?ip=8.8.8.8  (ip optional; defaults to caller's public IP)
app.get('/ipinfo', async (req, res) => {
  if (!checkRate(req)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const ipParam = (req.query.ip || '').toString().trim();
  const clientIp = getClientIp(req);
  const targetIp = isPublicIp(ipParam) ? ipParam : (isPublicIp(clientIp) ? clientIp : null);
  const cacheKey = targetIp || 'SELF';

  // serve cached
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json({ ...cached.data, cached: true, cache_ttl_seconds: Math.round((cached.expiresAt - now) / 1000) });
  }

  try {
    let result;
    try {
      result = await fetchFreeIPAPI(targetIp || '');
    } catch {
      result = await fetchIPGeolocation(targetIp || '');
    }
    cache.set(cacheKey, { data: result, expiresAt: now + TTL });
    res.json({ ...result, cached: false, cache_ttl_seconds: Math.round(TTL / 1000) });
  } catch (e) {
    res.status(502).json({ error: 'Lookup failed', detail: e.message });
  }
});

// Legacy endpoint for backward compatibility
app.get('/api/ip/:ip', async (req, res) => {
  if (!checkRate(req)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const ip = req.params.ip;
  const cacheKey = `ip_${ip}`;

  // serve cached
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json({
      success: true,
      source: 'Cache',
      data: cached.data
    });
  }

  try {
    let result;
    try {
      result = await fetchFreeIPAPI(ip);
    } catch {
      result = await fetchIPGeolocation(ip);
    }
    
    // Add calculated fields for backward compatibility
    const enhancedData = {
      ...result,
      ipv4: result.ip,
      ipv6: 'Not Available',
      domain: 'Not Available',
      isp: result.org || 'Not Available',
      asn: result.asn || 'Not Available',
      city: result.city || 'Unknown',
      region: result.region || 'Unknown',
      country: result.country || 'Unknown',
      country_name: result.country || 'Unknown',
      country_code: result.country_code || 'Unknown',
      continent: 'Unknown',
      postal: result.postal || 'Not Available',
      latitude: result.lat || 0,
      longitude: result.lon || 0,
      timezone: result.timezone || 'Unknown',
      decimal: result.ip ? (result.ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0)) : 0,
      binary: result.ip ? result.ip.split('.').map(octet => parseInt(octet).toString(2).padStart(8, '0')).join(' ') : '',
      hex: result.ip ? '0x' + result.ip.split('.').map(octet => parseInt(octet).toString(16).padStart(2, '0')).join('') : '',
      ip_class: result.ip ? (parseInt(result.ip.split('.')[0]) <= 126 ? 'A' : 
                           parseInt(result.ip.split('.')[0]) <= 191 ? 'B' : 
                           parseInt(result.ip.split('.')[0]) <= 223 ? 'C' : 
                           parseInt(result.ip.split('.')[0]) <= 239 ? 'D' : 'E') : 'Unknown',
      ip_type: result.ip ? (result.ip.startsWith('127.') ? 'Loopback' : 
                          result.ip.startsWith('10.') || 
                          (result.ip.startsWith('172.') && parseInt(result.ip.split('.')[1]) >= 16 && parseInt(result.ip.split('.')[1]) <= 31) ||
                          result.ip.startsWith('192.168.') ? 'Private' : 'Public') : 'Unknown'
    };
    
    cache.set(cacheKey, { data: enhancedData, expiresAt: now + TTL });
    res.json({
      success: true,
      source: result.source,
      data: enhancedData
    });
  } catch (e) {
    res.status(502).json({
      success: false,
      error: 'Lookup failed',
      detail: e.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cacheStats: {
      keys: cache.size,
      hits: 0, // Would need to track hits separately
      misses: 0
    },
    rateLimit: {
      perMinute: RATE_LIMIT_PER_MIN,
      activeClients: hits.size
    }
  });
});

// Cache management endpoint
app.get('/api/cache/stats', (req, res) => {
  res.json({
    cacheStats: {
      size: cache.size,
      keys: Array.from(cache.keys())
    },
    rateLimit: {
      perMinute: RATE_LIMIT_PER_MIN,
      activeClients: hits.size
    }
  });
});

// Clear cache endpoint
app.delete('/api/cache', (req, res) => {
  cache.clear();
  hits.clear();
  res.json({
    success: true,
    message: 'Cache cleared successfully'
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Enhanced IP API Server running on port ${port}`);
  console.log(`[${new Date().toISOString()}] Health check: http://localhost:${port}/api/health`);
  console.log(`[${new Date().toISOString()}] New endpoint: http://localhost:${port}/ipinfo?ip={IP}`);
  console.log(`[${new Date().toISOString()}] Legacy endpoint: http://localhost:${port}/api/ip/{IP}`);
  console.log(`[${new Date().toISOString()}] Rate limit: ${RATE_LIMIT_PER_MIN} requests per minute`);
  console.log(`[${new Date().toISOString()}] Cache TTL: ${TTL / (60 * 60 * 1000)} hours`);
});

module.exports = app;
