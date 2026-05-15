// GET    /api/fundraising/email-templates/[id]  — fetch one template
// PATCH  /api/fundraising/email-templates/[id]  — update fields (manager only)
// DELETE /api/fundraising/email-templates/[id]  — drop the template (manager only)

import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
} from '@/lib/fundraising-email-templates';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;
  const tpl = await getTemplate(id, session.ownerId);
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  // Field-by-field — undefined keys are ignored by updateTemplate, so the caller can PATCH
  // a single field at a time (e.g. flipping is_default without touching the body).
  const input: Record<string, unknown> = {};
  if ('name' in body) input.name = String(body.name);
  if ('subject' in body) input.subject = String(body.subject);
  if ('body_html' in body) input.body_html = String(body.body_html);
  if ('body_text' in body) input.body_text = body.body_text === null ? null : String(body.body_text);
  if ('is_default' in body) input.is_default = !!body.is_default;

  const tpl = await updateTemplate(id, session.ownerId, input);
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();
  const { id } = await params;
  const ok = await deleteTemplate(id, session.ownerId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
