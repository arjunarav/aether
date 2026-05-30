import { getBriefing } from '@/lib/aether-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getBriefing('auto-briefing'));
}
