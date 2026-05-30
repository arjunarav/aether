import { draftAction } from '@/lib/aether-data';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return Response.json(draftAction(body));
}
