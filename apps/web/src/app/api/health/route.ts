// Endpoint de healthcheck para o Railway — retorna 200 sem redirect/auth
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', { status: 200 });
}
