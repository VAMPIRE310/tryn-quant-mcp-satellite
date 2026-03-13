# MCP Satellite Router

A Vercel-hosted MCP endpoint that routes requests to your Railway backend or local OpenClaw gateway. This solves the problem of Vercel serverless functions losing authentication and dropping SSE connections.

## How It Works

```
GitHub Copilot → Vercel (MCP Satellite) → Your Backend (Railway/OpenClaw)
                     ↓
              Authentication check
              Proxy with keep-alive
              Error handling
```

Instead of running the MCP server directly on Vercel (which doesn't work well with SSE and long-running connections), this acts as a **router/proxy** that forwards requests to:
1. **Railway** (recommended for production) - stable, persistent connection
2. **Your PC via OpenClaw tunnel** - for development, connects through Cloudflare tunnel

## Setup

### 1. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

**Required variables:**

```env
# For production - use Railway
USE_RAILWAY=true
RAILWAY_MCP_URL=https://your-railway-app.up.railway.app

# OR for development - use your PC via tunnel
OPENCLAW_TUNNEL_URL=https://offering-soil-interviews-estimation.trycloudflare.com

# Authentication (set a secure random token)
MCP_AUTH_TOKEN=your-secure-random-token-here
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Deploy to Vercel

```bash
vercel --prod
```

Set the environment variables in Vercel dashboard.

## Architecture

### The Problem with Vercel MCP

❌ Serverless functions timeout after seconds
❌ SSE connections get dropped
❌ No persistent state between requests
❌ Cold starts interrupt connections

### The Solution

✅ Vercel acts as a stateless proxy
✅ Long-running connections handled by Railway/PC
✅ Authentication verified at the edge
✅ Automatic reconnection if backend drops

## Routing Logic

The router prioritizes backends in this order:

1. **Railway** (`USE_RAILWAY=true`) - Most stable for production
2. **OpenClaw Tunnel** (`OPENCLAW_TUNNEL_URL`) - Your PC via Cloudflare
3. **Local Gateway** (`OPENCLAW_GATEWAY_URL`) - Direct localhost (dev only)

## Authentication

All requests must include:

```
Authorization: Bearer <MCP_AUTH_TOKEN>
```

The token is validated by the Vercel edge function before proxying.

## Usage with GitHub Copilot

Add to your Copilot MCP configuration:

```json
{
  "mcpServers": {
    "tryn-quant-satellite": {
      "type": "sse",
      "url": "https://your-vercel-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      },
      "tools": ["*"]
    }
  }
}
```

## Troubleshooting

### "MCP gateway unavailable" error
- Check if Railway/OpenClaw is running
- Verify the URL in environment variables
- Check Vercel function logs

### Authentication errors
- Verify `MCP_AUTH_TOKEN` is set in both Vercel and Copilot config
- Check token matches exactly (no extra spaces)

### SSE connection drops
- This is normal for long idle periods
- The proxy will reconnect automatically
- For persistent connections, use Railway instead of local tunnel

## Security Notes

- Keep `MCP_AUTH_TOKEN` secret - it's your only protection
- Don't commit `.env.local` to git
- Rotate tokens regularly
- Use Railway for production (more secure than exposing your PC)
