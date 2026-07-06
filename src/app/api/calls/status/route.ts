// POST /api/calls/status?id=<scheduled_call_id>
//
// Public webhook Twilio POSTs the final call status to (completed / no-answer / busy /
// failed / canceled). We record it against the scheduled call so the UI can show what
// happened. Twilio sends form-urlencoded data including CallStatus and CallSid.

import { db, dbReady } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const form = await request.formData();
    const callStatus = String(form.get('CallStatus') || '');
    const callSid = String(form.get('CallSid') || '');

    await dbReady();

    // Map Twilio's final status onto our row status. "completed" = the call connected and
    // ran the TwiML; anything else (no-answer/busy/failed/canceled) is a failed attempt.
    // For recurring rows we keep status='recurring' (only record the last call_status) so a
    // single occurrence's outcome doesn't disable the repeat.
    const ourStatus = callStatus === 'completed' ? 'completed' : 'failed';

    await db().execute({
      sql: `UPDATE fr_scheduled_calls
            SET call_status = ?,
                status = CASE WHEN recurring = 1 THEN status ELSE ? END,
                twilio_sid = COALESCE(twilio_sid, ?)
            WHERE id = ?`,
      args: [callStatus || null, ourStatus, callSid || null, id],
    });
  } catch (err) {
    console.error('[calls/status] error:', err);
  }

  // Always 200 so Twilio doesn't retry endlessly.
  return new Response('OK');
}
