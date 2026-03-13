import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextApiRequest, NextApiResponse } from 'next';

// MCP Satellite Router
// Routes MCP requests to the appropriate backend:
// - Development/Local: OpenClaw gateway on user's PC
// - Production: Railway instance
// - Fallback: Direct Vercel handling (limited)

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const RAILWAY_MCP_URL = process.env.RAILWAY_MCP_URL || 'https://your-railway-app.up.railway.app';
const MCP_PATH = '/mcp';

// Determine target based on environment and availability
const getTarget = (): string => {
  // Priority 1: Railway (production/stable)
  if (process.env.USE_RAILWAY === 'true') {
    return RAILWAY_MCP_URL;
  }
  
  // Priority 2: OpenClaw tunnel (development/user PC)
  // This connects to your PC via the cloudflare tunnel
  if (process.env.OPENCLAW_TUNNEL_URL) {
    return process.env.OPENCLAW_TUNNEL_URL;
  }
  
  // Priority 3: Direct OpenClaw gateway (if running locally)
  return OPENCLAW_GATEWAY_URL;
};

// Authentication check
const isAuthenticated = (req: NextApiRequest): boolean => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.MCP_AUTH_TOKEN;
  
  if (!expectedToken) {
    console.warn('MCP_AUTH_TOKEN not set - allowing all requests');
    return true;
  }
  
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '').trim();
  return token === expectedToken;
};

// Create proxy middleware
const proxyMiddleware = createProxyMiddleware({
  target: getTarget(),
  changeOrigin: true,
  pathRewrite: {
    '^/api/mcp': '/mcp', // Remove /api prefix when forwarding
  },
  ws: true, // Support WebSocket upgrades
  timeout: 300000, // 5 minute timeout for long operations
  proxyTimeout: 300000,
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(502).json({
      error: 'MCP gateway unavailable',
      message: 'Could not connect to MCP server. Check if OpenClaw/Railway is running.',
      target: getTarget()
    });
  },
  onProxyReq: (proxyReq, req) => {
    // Log proxy requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MCP Proxy] ${req.method} ${req.url} -> ${getTarget()}${MCP_PATH}`);
    }
    
    // Forward authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
      proxyReq.setHeader('Authorization', authHeader);
    }
  },
  onProxyRes: (proxyRes, req) => {
    // Add CORS headers if needed
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  // Check authentication
  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
    return;
  }

  // SSE handling for GET requests (MCP initialization)
  if (req.method === 'GET') {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  }

  // Route to proxy
  return new Promise((resolve, reject) => {
    proxyMiddleware(req, res, (result) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

// Disable body parsing - let the proxy handle raw body
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
