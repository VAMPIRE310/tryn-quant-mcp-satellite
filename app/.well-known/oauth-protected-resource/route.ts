import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

const handler = protectedResourceHandler({
  authServerUrls: [],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export const GET = async (req: Request) => (handler as any)(req);
export const OPTIONS = async () => {
  const response = (corsHandler as any)();
  return new Response(null, {
    status: 204,
    headers: response.headers,
  });
};
