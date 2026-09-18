/**
 * /api/admin/content — the ONLY way content gets written to Supabase.
 *
 * Security model:
 *   - The browser never gets write access to Supabase directly (the
 *     publishable key used elsewhere on the site can only READ).
 *   - This function checks the signed admin session cookie itself
 *     (same HMAC approach as middleware.js) before doing anything.
 *   - Only if that checks out does it use the SECRET service_role key
 *     (server-side only, never sent to the browser) to perform the write.
 *
 * Env vars required (Vercel → Settings → Environment Variables):
 *   ADMIN_AUTH_SECRET     — signs/verifies the admin session cookie
 *   SUPABASE_URL          — same project URL used in content.js
 *   SUPABASE_SERVICE_ROLE_KEY — the SECRET key, server-side only
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_TABLES = {
  sermons: ['title', 'sermon_date', 'speaker', 'category', 'youtube_link', 'audio_file', 'published'],
  events: ['title', 'event_date', 'event_time', 'location', 'description', 'image_url', 'video_url', 'published'],
  ministries: ['name', 'category', 'description', 'published'],
  settings: [
    'phone', 'whatsapp', 'email', 'address', 'service_times',
    'bank_name', 'account_number', 'account_name',
    'anniversary_enabled', 'anniversary_theme', 'anniversary_verse',
    'anniversary_date', 'anniversary_details',
  ],
};

function verifySignature(payload, signatureHex, secret) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signatureHex;
}

function isValidAdminSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)cacg_admin_session=([^;]+)/);
  if (!match) return false;

  const cookieValue = decodeURIComponent(match[1]);
  const parts = cookieValue.split('.');
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

  const { table, action, id, data } = req.body || {};

  if (!ALLOWED_TABLES[table]) {
    return res.status(400).json({ error: `Unknown table "${table}".` });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const allowedColumns = ALLOWED_TABLES[table];

  // Strip out any field not explicitly allowed for this table — a safety
  // net so a bug (or tampering) can never write to an unexpected column.
  const cleanData = {};
  if (data) {
    for (const key of allowedColumns) {
      if (Object.prototype.hasOwnProperty.call(data, key)) cleanData[key] = data[key];
    }
  }

  try {
    if (action === 'list') {
      const { data: rows, error } = await supabase.from(table).select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ success: true, rows });
    }

    if (action === 'insert') {
      const { data: row, error } = await supabase.from(table).insert(cleanData).select().single();
      if (error) throw error;
      return res.status(200).json({ success: true, row });
    }

    if (action === 'update') {
      if (table === 'settings') {
        const { data: row, error } = await supabase.from('settings').update(cleanData).eq('id', 1).select().single();
        if (error) throw error;
        return res.status(200).json({ success: true, row });
      }
      if (!id) return res.status(400).json({ error: 'Missing id for update.' });
      const { data: row, error } = await supabase.from(table).update(cleanData).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ success: true, row });
    }

    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'Missing id for delete.' });
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action "${action}".` });
  } catch (err) {
    console.error('admin/content error:', err);
    return res.status(500).json({ error: err.message || 'Database error.' });
  }
}
