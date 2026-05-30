import { getRegret } from '@/lib/aether-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getRegret('regret-module'));
}
