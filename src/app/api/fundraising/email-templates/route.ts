// GET  /api/fundraising/email-templates       — list all templates for the owner
// POST /api/fundraising/email-templates       — create a new template
//
// GET supports `?kind=` to filter to a single kind (receipt | campaign | thank_you | custom).
// Manager-only for writes; reads are open to fundraisers too so the campaign-blast UI can
// load templates a manager saved.

import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import {
  listTemplates,
  createTemplate,
  type TemplateKind,
} from '@/lib/fundraising-email-templates';

const VALID_KINDS: TemplateKind[] = ['receipt', 'campaign', 'thank_you', 'custom'];

export async function GET(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam && (VALID_KINDS as string[]).includes(kindParam)
    ? (kindParam as TemplateKind)
    : undefined;
  const templates = await listTemplates(session.ownerId, kind);
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || '').trim() as TemplateKind;
  if (!(VALID_KINDS as string[]).includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${VALID_KINDS.join(', ')}` }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  const subject = String(body.subject || '').trim();
  const body_html = String(body.body_html || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });
  if (!body_html) return NextResponse.json({ error: 'body_html required' }, { status: 400 });

  const template = await createTemplate({
    ownerId: session.ownerId,
    kind,
    name,
    subject,
    body_html,
    body_text: body.body_text ? String(body.body_text) : null,
    is_default: !!body.is_default,
  });

  return NextResponse.json({ template });
}
