import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

// PATCH /api/fundraising/donors/[id]/cards/[cardId]
//   Body: { is_default?: boolean }
//   Right now the only mutable field is is_default. Future: cardholder_name updates,
//   billing address updates (we don't re-tokenize — the card stays valid in Cardknox).
//
// DELETE /api/fundraising/donors/[id]/cards/[cardId]
//   Soft-delete: sets status='removed'. We never DELETE the row because paid payments
//   reference the card_id via fr_auto_charge_log for audit; hard-deleting would orphan them.
//   Also clears auto_charge_card_id on any pledge that was using this card so future
//   cron runs skip them (the pledge stays open and can be reattached to another card).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> },
) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: donorId, cardId } = await params;

  const access = await ensureDonorAccess(donorId, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const card = await db().execute({
    sql: "SELECT id FROM fr_donor_cards WHERE id = ? AND donor_id = ? AND status = 'active'",
    args: [cardId, donorId],
  });
  if (card.rows.length === 0) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { is_default?: boolean };

  if (body.is_default === true) {
    // Demote any other default for this donor, then promote this one.
    await db().execute({
      sql: 'UPDATE fr_donor_cards SET is_default = 0 WHERE donor_id = ? AND id != ?',
      args: [donorId, cardId],
    });
    await db().execute({
      sql: 'UPDATE fr_donor_cards SET is_default = 1 WHERE id = ?',
      args: [cardId],
    });
  } else if (body.is_default === false) {
    await db().execute({
      sql: 'UPDATE fr_donor_cards SET is_default = 0 WHERE id = ?',
      args: [cardId],
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> },
) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: donorId, cardId } = await params;

  const access = await ensureDonorAccess(donorId, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Soft-delete + clear auto_charge_card_id on any pledges using it.
  await db().batch(
    [
      {
        sql: "UPDATE fr_donor_cards SET status = 'removed', is_default = 0 WHERE id = ? AND donor_id = ?",
        args: [cardId, donorId],
      },
      {
        sql: 'UPDATE fr_pledges SET auto_charge_card_id = NULL WHERE auto_charge_card_id = ?',
        args: [cardId],
      },
    ],
    'write',
  );

  return NextResponse.json({ ok: true });
}
