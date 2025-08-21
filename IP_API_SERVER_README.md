# IP API Server - Robust IP Lookup Service

This is a backend service that provides robust IP geolocation lookup with caching and fallback support.

## Features

- **Primary API**: FreeIPAPI (free.freeipapi.com)
- **Fallback API**: ipgeolocation.io (with API key)
- **Caching**: 12-hour cache to reduce API calls
- **Data Normalization**: Consistent data format from different APIs
- **Health Monitoring**: Built-in health check and cache statistics

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

**Windows:**
```bash
start-ip-server.bat
```

**Manual:**
```bash
npm start
```

### 3. Verify Server is Running

Visit: http://localhost:3000/api/health

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-21T02:30:00.000Z",
  "cacheStats": {
    "keys": 0,
    "hits": 0,
    "misses": 0
  }
}
```

## API Endpoints

### IP Lookup
```
GET /api/ip/{IP}
```

**Example:**
```
GET http://localhost:3000/api/ip/8.8.8.8
```

**Response:**
```json
{
  "success": true,
  "source": "FreeIPAPI",
  "data": {
    "ip": "8.8.8.8",
    "ipv4": "8.8.8.8",
    "domain": "dns.google",
    "isp": "Google LLC",
    "asn": "AS15169",
    "city": "Mountain View",
    "region": "California",
    "country": "United States",
    "country_code": "US",
    "continent": "North America",
    "latitude": 37.4056,
    "longitude": -122.0775,
    "timezone": "America/Los_Angeles",
    "decimal": 134744072,
    "binary": "00001000 00001000 00001000 00001000",
    "hex": "0x08080808",
    "ip_class": "A",
    "ip_type": "Public"
  }
}
```

### Health Check
```
GET /api/health
```

### Cache Statistics
```
GET /api/cache/stats
```

### Clear Cache
```
DELETE /api/cache
```

## Frontend Integration

The frontend (`ip-checker.html`) has been updated to use this backend service. It will:

1. Call `http://localhost:3000/api/ip/{IP}` for IP lookups
2. Add client-side calculated fields (browser info, neighborhood, etc.)
3. Display comprehensive IP information

## Caching Strategy

- **Cache Duration**: 12 hours
- **Cache Key**: `ip_{IP_ADDRESS}`
- **Benefits**: 
  - Reduces API calls by ~95%
  - Improves response times
  - Avoids rate limiting
  - Reduces costs

## Fallback Strategy

1. **Primary**: FreeIPAPI (free, no key required)
2. **Fallback**: ipgeolocation.io (requires API key)
3. **Error Handling**: Returns 503 if both APIs fail

## Data Normalization

The server normalizes data from different APIs to ensure consistent format:

- **IP Address**: Standardized IPv4 format
- **Location**: City, Region, Country, Coordinates
- **Network**: ISP, ASN, Domain
- **Calculated**: Decimal, Binary, Hex, IP Class, IP Type

## Monitoring

### Logs
The server logs all operations:
```
[2025-08-21T02:30:00.000Z] IP API Server running on port 3000
[2025-08-21T02:30:05.000Z] Cache miss for IP: 8.8.8.8, fetching from APIs
[2025-08-21T02:30:05.500Z] FreeIPAPI success for IP: 8.8.8.8
[2025-08-21T02:30:05.501Z] Successfully retrieved and cached data for IP: 8.8.8.8 from FreeIPAPI
```

### Health Check
Monitor server health at: http://localhost:3000/api/health

### Cache Stats
View cache performance at: http://localhost:3000/api/cache/stats

## Troubleshooting

### Server Won't Start
1. Check if port 3000 is available
2. Ensure Node.js is installed (v14+)
3. Run `npm install` to install dependencies

### API Calls Failing
1. Check server is running: http://localhost:3000/api/health
2. Verify network connectivity
3. Check API keys are valid (for fallback service)

### Cache Issues
1. Clear cache: `DELETE /api/cache`
2. Check cache stats: `GET /api/cache/stats`

## Production Deployment

For production use:

1. **Environment Variables**: Set API keys via environment variables
2. **HTTPS**: Use HTTPS in production
3. **Rate Limiting**: Add rate limiting middleware
4. **Monitoring**: Add proper logging and monitoring
5. **Load Balancing**: Use multiple server instances

## API Keys

The fallback service (ipgeolocation.io) requires an API key. Update the key in `ip-api-server.js`:

```javascript
const IPGEO_API_KEY = 'your-api-key-here';
```

For production, use environment variables:

```javascript
const IPGEO_API_KEY = process.env.IPGEO_API_KEY || '2740500f950b4a0eabee07704cae1f36';
```
