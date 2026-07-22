import { createClient } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/membership';

// Admin actions on the feature board: mark an idea Shipped (crossed out with
// the badge), reopen one, or delete spam. Gated on ADMIN_EMAIL like every
// other admin route; the widget only shows these controls to the admin, but
// this check is the real gate.
export async function POST(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  const adminUser = await getAdminUser(token);
  if (!adminUser) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  try {
    const { id, action } = await request.json();
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return Response.json({ error: 'Unknown request.' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let result;
    if (action === 'ship') {
      result = await admin.from('feature_requests').update({ status: 'shipped' }).eq('id', id);
    } else if (action === 'reopen') {
      result = await admin.from('feature_requests').update({ status: 'open' }).eq('id', id);
    } else if (action === 'delete') {
      result = await admin.from('feature_requests').delete().eq('id', id);
    } else {
      return Response.json({ error: 'Unknown action.' }, { status: 400 });
    }

    if (result.error) {
      return Response.json({ error: 'Action failed.' }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Action failed.' }, { status: 500 });
  }
}
