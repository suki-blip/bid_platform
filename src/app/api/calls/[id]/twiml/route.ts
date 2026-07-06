// GET /api/calls/[id]/twiml
//
// Public fallback endpoint that returns the DTMF step TwiML for a scheduled call. The dialer
// now passes TwiML inline when placing calls, so this is only used if a call is ever placed
// with a Url webhook instead. The id is an unguessable UUID; missing rows return empty TwiML.

import { db, dbReady } from '@/lib/db';
import { stepsTwiml } from '@/lib/twilio';
import { parseSteps } from '@/app/api/cron/dial/route';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
  try {
    await dbReady();
    const r = await db().execute({
      sql: 'SELECT digits, pause_seconds, steps_json FROM fr_scheduled_calls WHERE id = ?',
      args: [id],
    });
    if (r.rows.length > 0) {
      const steps = parseSteps(r.rows[0].steps_json, r.rows[0].digits, r.rows[0].pause_seconds);
      twiml = stepsTwiml(steps);
    }
  } catch {
    // Fall through to the hangup TwiML.
  }

  return new Response(twiml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

export const POST = GET;
