import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getVendorFromRequest } from '@/lib/vendor-auth';
import { hashPassword, verifyPassword, validatePassword } from '@/lib/auth';

export async function PATCH(request: Request) {
  try {
    const vendor = await getVendorFromRequest(request);
    if (!vendor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbReady();
    const body = await request.json();

    // Handle password change
    if (body.current_password && body.new_password) {
      // Get current hash
      const result = await db().execute({
        sql: 'SELECT password_hash FROM vendors WHERE id = ?',
        args: [String(vendor.id)],
      });
      const current = result.rows[0] as Record<string, unknown>;

      if (current.password_hash) {
        const valid = await verifyPassword(body.current_password, current.password_hash as string);
        if (!valid) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
        }
      }

      const validation = validatePassword(body.new_password);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const hash = await hashPassword(body.new_password);
      await db().execute({
        sql: 'UPDATE vendors SET password_hash = ? WHERE id = ?',
        args: [hash, String(vendor.id)],
      });

      return NextResponse.json({ success: true, message: 'Password updated' });
    }

    // Handle profile update
    const allowed = ['name', 'phone', 'contact_person', 'website', 'notes'];
    const updates: string[] = [];
    const args: string[] = [];

    for (const field of allowed) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        args.push(String(body[field]));
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    args.push(String(vendor.id));
    await db().execute({
      sql: `UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    // Return updated vendor
    const updated = await db().execute({
      sql: `SELECT id, name, email, phone, contact_person, trade_category, website, license, notes, status FROM vendors WHERE id = ?`,
      args: [String(vendor.id)],
    });

    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
