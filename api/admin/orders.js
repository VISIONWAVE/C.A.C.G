/**
 * /api/admin/orders — admin-only management of cloth orders.
 * Uses the same signed "cacg_admin_session" cookie as /api/admin/content.
 * Actions: list, update, delete.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const STATUSES = ['pending', 'payment_claimed', 'paid', 'delivered', 'cancelled'];

function verifySignature(payload, signatureHex, secret) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signatureHex;
}

function isValidAdminSession(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)cacg_admin_session=([^;]+)/);
  if (!match) return false;

  const parts = decodeURIComponent(match[1]).split('.');
  if (parts.length !== 2) return false;

  const [expiryStr, signature] = parts;
  const expiry = Number(expiryStr);
  const secret = process.env.ADMIN_AUTH_SECRET || 'cacg-admin-fallback-secret-change-me';

  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  return verifySignature(expiryStr, signature, secret);
}

export default async function handler(req, res) {
  if (!isValidAdminSession(req)) {
    return res.status(401).json({ error: 'Not logged in as admin.' });
  }

  const { action, id, data } = req.body || {};
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    if (action === 'list') {
      const { data: rows, error } = await supabase
        .from('cloth_orders')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, rows });
    }

    if (action === 'update') {
      if (!id) return res.status(400).json({ error: 'Missing id.' });

      const update = {};

      if (data && STATUSES.includes(data.status)) {
        update.status = data.status;
      }

      if (data && Object.prototype.hasOwnProperty.call(data, 'admin_notes')) {
        update.admin_notes = String(data.admin_notes || '').slice(0, 500) || null;
      }

      const { data: row, error } = await supabase
        .from('cloth_orders')
        .update(update)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, row });
    }

    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'Missing id.' });

      const { error } = await supabase
        .from('cloth_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action "${action}".` });
  } catch (err) {
    console.error('admin/orders error:', err);
    return res.status(500).json({ error: err.message || 'Database error.' });
  }
}