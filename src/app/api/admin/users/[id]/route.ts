import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbReady();
  const { id } = await params;
  const client = db();
  const result = await client.execute({
    sql: 'SELECT id, name, company, email, status, payment, plan, joined, last_login FROM saas_users WHERE id = ?',
    args: [id],
  });
  if (!result.rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json(result.rows[0]);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbReady();
  const { id } = await params;
  const client = db();
  const body = await request.json();

  const user = await client.execute({ sql: 'SELECT * FROM saas_users WHERE id = ?', args: [id] });
  if (!user.rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const current = user.rows[0] as any;

  // Status change
  if (body.status && body.status !== current.status) {
    await client.execute({ sql: 'UPDATE saas_users SET status = ? WHERE id = ?', args: [body.status, id] });
    const actType = body.status === 'suspended' ? 'suspend' : 'activate';
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), actType, `${current.name} — account ${body.status === 'suspended' ? 'suspended' : 'activated'}`],
    });
  }

  // Payment change
  if (body.payment && body.payment !== current.payment) {
    await client.execute({ sql: 'UPDATE saas_users SET payment = ? WHERE id = ?', args: [body.payment, id] });
  }

  // Password change
  if (body.password) {
    const pwdCheck = validatePassword(body.password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }
    const hash = await hashPassword(body.password);
    await client.execute({ sql: 'UPDATE saas_users SET password_hash = ? WHERE id = ?', args: [hash, id] });
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'admin', `Admin changed password for ${current.name}`],
    });
  }

  // Name/company/email update
  if (body.name) await client.execute({ sql: 'UPDATE saas_users SET name = ? WHERE id = ?', args: [body.name, id] });
  if (body.company !== undefined) await client.execute({ sql: 'UPDATE saas_users SET company = ? WHERE id = ?', args: [body.company, id] });

  const updated = await client.execute({
    sql: 'SELECT id, name, company, email, status, payment, plan, joined, last_login FROM saas_users WHERE id = ?',
    args: [id],
  });
  return NextResponse.json(updated.rows[0]);
}
