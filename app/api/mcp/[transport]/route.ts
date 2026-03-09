import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';

const handler = createMcpHandler(
  (server) => {
    // Basic connectivity tool
    server.tool(
      'status_check',
      'Checks the status of the Vercel MCP server',
      {},
      async () => {
        return {
          content: [{ type: 'text', text: '✅ Vercel MCP Server is online and stable!' }],
        };
      },
    );

    server.tool(
      'market_pulse',
      'Analyzes current market health across major crypto pairs',
      {},
      async () => {
        // Simulated market pulse logic
        const pulse = {
          sentiment: 'Bullish',
          volatility: 'Medium',
          top_gainers: ['BTC (+2.4%)', 'ETH (+1.8%)', 'SOL (+5.2%)'],
          global_cap: '$2.45T',
          timestamp: new Date().toISOString()
        };
        return {
          content: [{ type: 'text', text: `📊 Market Pulse Analysis:\nSentiment: ${pulse.sentiment}\nVolatility: ${pulse.volatility}\nTop Performers: ${pulse.top_gainers.join(', ')}\nGlobal Market Cap: ${pulse.global_cap}` }],
        };
      },
    );

    server.tool(
      'remote_exec',
      'Sends a PowerShell or CLI command to the Home PC for remote execution',
      { command: z.string().describe('The command to run on the home PC') },
      async ({ command }) => {
        const supabase = createClient(
          process.env.VITE_SUPABASE_URL!,
          process.env.VITE_SUPABASE_ANON_KEY!
        );

        // 1. Insert command into relay
        const { data, error } = await supabase
          .from('remote_commands')
          .insert([{ command }])
          .select()
          .single();

        if (error) return { content: [{ type: 'text', text: `❌ Relay Error: ${error.message}` }], isError: true };

        // 2. Poll for results (Max 30 seconds for Vercel timeout safety)
        let attempts = 0;
        while (attempts < 15) {
          await new Promise(r => setTimeout(r, 2000));
          const { data: result } = await supabase
            .from('remote_commands')
            .select('*')
            .eq('id', data.id)
            .single();

          if (result && result.status === 'completed') {
            return { content: [{ type: 'text', text: `✅ Execution Complete:\n\n${result.output}` }] };
          }
          if (result && result.status === 'failed') {
            return { content: [{ type: 'text', text: `❌ Execution Failed:\n\n${result.error}` }], isError: true };
          }
          attempts++;
        }

        return { content: [{ type: 'text', text: `⏳ Command sent (ID: ${data.id}), but execution is still in progress. Check status later.` }] };
      },
    );

    // Placeholder for future trading-specific tools
    server.tool(
      'ping_backend',
      'Pings the Railway backend to check connectivity',
      {},
      async () => {
        try {
          const startTime = Date.now();
          const response = await fetch('https://trynquant-api-production.up.railway.app/health');
          const duration = Date.now() - startTime;
          
          if (response.ok) {
            return {
              content: [{ type: 'text', text: `🚀 Railway Backend is responsive! Latency: ${duration}ms` }],
            };
          }
          return {
            content: [{ type: 'text', text: `⚠️ Railway Backend returned status ${response.status}` }],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `❌ Failed to connect to Railway Backend: ${error.message}` }],
          };
        }
      },
    );
  },
  {},
  { 
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: true
  },
);

export const GET = async (req: Request) => (handler as any)(req);
export const POST = async (req: Request) => (handler as any)(req);
export const DELETE = async (req: Request) => (handler as any)(req);
