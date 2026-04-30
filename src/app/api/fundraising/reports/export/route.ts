import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const projectId = url.searchParams.get('project_id') || '';
  const sourceId = url.searchParams.get('source_id') || '';
  const fundraiserId = url.searchParams.get('fundraiser_id') || '';
  const donorId = url.searchParams.get('donor_id') || '';

  let where = `d.owner_id = ? AND pp.status = 'paid'`;
  const args: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    where += ' AND d.assigned_to = ?';
    args.push(session.fundraiserId!);
  } else if (fundraiserId) {
    where += ' AND d.assigned_to = ?';
    args.push(fundraiserId);
  }
  if (from) {
    where += ' AND pp.paid_date >= ?';
    args.push(from);
  }
  if (to) {
    where += ' AND pp.paid_date <= ?';
    args.push(to);
  }
  if (projectId) {
    where += ' AND pp.project_id = ?';
    args.push(projectId);
  }
  if (sourceId) {
    where += ' AND d.source_id = ?';
    args.push(sourceId);
  }
  if (donorId) {
    where += ' AND d.id = ?';
    args.push(donorId);
  }

  const rows = await db().execute({
    sql: `SELECT pp.paid_date, pp.amount, pp.method, pp.check_number, pp.bank_name, pp.cc_last4,
                 pp.transaction_ref, pp.receipt_number, pp.installment_number,
                 d.first_name, d.last_name, d.hebrew_name, d.email, d.organization,
                 prj.name AS project_name, s.name AS source_name,
                 (SELECT phone FROM fr_donor_phones WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS phone,
                 (SELECT street FROM fr_donor_addresses WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS street,
                 (SELECT city FROM fr_donor_addresses WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS city,
                 (SELECT state FROM fr_donor_addresses WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS state,
                 (SELECT zip FROM fr_donor_addresses WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS zip
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          LEFT JOIN fr_projects prj ON prj.id = pp.project_id
          LEFT JOIN fr_sources s ON s.id = d.source_id
          WHERE ${where}
          ORDER BY pp.paid_date DESC
          LIMIT 5000`,
    args,
  });

  const headers = [
    'Paid Date',
    'Amount',
    'First Name',
    'Last Name',
    'Hebrew Name',
    'Organization',
    'Project',
    'Method',
    'Check #',
    'Bank',
    'Card Last 4',
    'Transaction Ref',
    'Receipt #',
    'Installment',
    'Email',
    'Phone',
    'Street',
    'City',
    'State',
    'Zip',
    'Source',
  ];
  const lines = [headers.join(',')];
  for (const r of rows.rows) {
    lines.push(
      [
        r.paid_date,
        r.amount,
        r.first_name,
        r.last_name,
        r.hebrew_name,
        r.organization,
        r.project_name,
        r.method,
        r.check_number,
        r.bank_name,
        r.cc_last4,
        r.transaction_ref,
        r.receipt_number,
        r.installment_number,
        r.email,
        r.phone,
        r.street,
        r.city,
        r.state,
        r.zip,
        r.source_name,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  // Prepend BOM for Excel UTF-8 / Hebrew
  const csv = '﻿' + lines.join('\n');

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fundraising-report-${today}.csv"`,
    },
  });
}
