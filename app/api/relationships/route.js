import { getRelationships } from '@/lib/aether-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getRelationships('relationships-module'));
}
