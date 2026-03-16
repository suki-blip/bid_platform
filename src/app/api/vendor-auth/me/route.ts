import { NextResponse } from 'next/server';
import { getVendorFromRequest } from '@/lib/vendor-auth';

export async function GET(request: Request) {
  try {
    const vendor = await getVendorFromRequest(request);
    if (!vendor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(vendor);
  } catch (error) {
    console.error('Vendor me error:', error);
    return NextResponse.json({ error: 'Failed to get vendor info' }, { status: 500 });
  }
}
