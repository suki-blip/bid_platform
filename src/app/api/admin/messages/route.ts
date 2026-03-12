import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  await dbReady();
  const client = db();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '20');

  const result = await client.execute({
    sql: 'SELECT * FROM admin_messages ORDER BY sent_at DESC LIMIT ?',
    args: [limit],
  });
  return NextResponse.json({ messages: result.rows });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const client = db();
  const body = await request.json();
  const { recipients, subject, body: msgBody } = body;

  if (!subject || !msgBody || !recipients) {
    return NextResponse.json({ error: 'Subject, body, and recipients are required' }, { status: 400 });
  }

  // Get recipients based on filter type
  let users: any[];
  if (recipients.type === 'custom' && recipients.custom_ids?.length) {
    const placeholders = recipients.custom_ids.map(() => '?').join(',');
    const result = await client.execute({
      sql: `SELECT id, name, email, plan FROM saas_users WHERE id IN (${placeholders})`,
      args: recipients.custom_ids,
    });
    users = result.rows as any[];
  } else {
    const statusMap: Record<string, string> = {
      active: "status = 'active'",
      trial: "status = 'trial'",
      suspended: "status = 'suspended'",
      unpaid: "payment = 'unpaid'",
    };
    const where = statusMap[recipients.type] || '1=1';
    const result = await client.execute(`SELECT id, name, email, plan FROM saas_users WHERE ${where}`);
    users = result.rows as any[];
  }

  // Send emails with placeholder substitution
  let sentCount = 0;
  for (const user of users) {
    const rendered = msgBody
      .replace(/\{\{name\}\}/g, user.name)
      .replace(/\{\{email\}\}/g, user.email)
      .replace(/\{\{plan\}\}/g, user.plan);

    const renderedSubject = subject
      .replace(/\{\{name\}\}/g, user.name)
      .replace(/\{\{email\}\}/g, user.email)
      .replace(/\{\{plan\}\}/g, user.plan);

    await sendEmail({
      to: user.email as string,
      subject: renderedSubject,
      html: `<div style="font-family:sans-serif;white-space:pre-wrap">${rendered}</div>`,
    });
    sentCount++;
  }

  // Save message record
  const id = crypto.randomUUID();
  await client.execute({
    sql: 'INSERT INTO admin_messages (id, subject, body, recipients_filter, recipient_count) VALUES (?, ?, ?, ?, ?)',
    args: [id, subject, msgBody, JSON.stringify(recipients), sentCount],
  });

  // Log activity
  const labels: Record<string, string> = {
    all: 'all users', active: 'active users', trial: 'trial users',
    unpaid: 'unpaid users', suspended: 'suspended users', custom: 'selected users',
  };
  await client.execute({
    sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
    args: [crypto.randomUUID(), 'message', `Message sent: "${subject}" to ${sentCount} ${labels[recipients.type] || 'users'}`],
  });

  return NextResponse.json({ sent: sentCount });
}
