// POST /api/fundraising/email-templates/preview
//
// Used by the editor's preview pane — renders an ad-hoc subject + body against either a
// real donor context or the built-in sample context. The template isn't saved.
//
// Body: { subject, body_html, body_text?, donor_id?, context? }
//   - donor_id: if supplied, we load that donor and project a context from it. This is
//     what makes "Preview as: Suki Goldstein" work in the UI.
//   - context: a free-form { key: string } override that wins over the donor context.
//   - if neither is supplied, the built-in SAMPLE_PREVIEW_CONTEXT is used.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import {
  interpolate,
  SAMPLE_PREVIEW_CONTEXT,
  type TemplateContext,
} from '@/lib/fundraising-email-templates';

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject || '');
  const body_html = String(body.body_html || '');
  const body_text = body.body_text ? String(body.body_text) : null;
  const donorId = body.donor_id ? String(body.donor_id) : null;
  const overrides: TemplateContext = body.context && typeof body.context === 'object' ? body.context : {};

  // Build the context: defaults <- donor data <- explicit overrides.
  let ctx: TemplateContext = { ...SAMPLE_PREVIEW_CONTEXT };

  if (donorId) {
    const d = await db().execute({
      sql: `SELECT first_name, last_name, hebrew_name, email, organization
            FROM fr_donors WHERE id = ? AND owner_id = ?`,
      args: [donorId, session.ownerId],
    });
    if (d.rows.length > 0) {
      const row = d.rows[0];
      const fn = String(row.first_name || '');
      const ln = (row.last_name as string | null) || '';
      ctx = {
        ...ctx,
        first_name: fn,
        last_name: ln,
        full_name: `${fn}${ln ? ' ' + ln : ''}`.trim() || ctx.full_name,
        hebrew_name: (row.hebrew_name as string | null) || '',
      };
    }
  }

  ctx = { ...ctx, ...overrides };

  return NextResponse.json({
    subject: interpolate(subject, ctx),
    body_html: interpolate(body_html, ctx),
    body_text: body_text ? interpolate(body_text, ctx) : null,
    context_used: ctx,
  });
}
