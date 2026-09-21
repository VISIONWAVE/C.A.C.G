/**
 * /api/admin/content — controlled CMS writes for C.A.C.G. Global.
 *
 * Settings now include editable homepage identity/vision fields.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_TABLES = {
  sermons: [
    'title', 'sermon_date', 'speaker', 'category',
    'youtube_link', 'audio_file', 'published'
  ],

  events: [
    'title', 'event_date', 'event_time', 'location',
    'description', 'image_url', 'video_url', 'published'
  ],

  ministries: [
    'name', 'category', 'description', 'published'
  ],

  settings: [
    'phone', 'whatsapp', 'email', 'address', 'service_times',
    'bank_name', 'account_number', 'account_name',

    /* C.A.C.G. Global homepage identity */
    'brand_short',
    'tagline',
    'who_we_are',
    'vision_eyebrow',
    'vision_title',
    'vision_text',

    /* Existing anniversary controls */
    'anniversary_enabled',
    'anniversary_theme',
    'anniversary_verse',
    'anniversary_date',
    'anniversary_details'
  ]
};

function verifySignature(payload, signatureHex, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

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
  const secret =
    process.env.ADMIN_AUTH_SECRET ||
    'cacg-admin-fallback-secret-change-me';

  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;

  return verifySignature(expiryStr, signature, secret);
}

export default async function handler(req, res) {
  if (!isValidAdminSession(req)) {
    return res.status(401).json({ error: 'Not logged in as admin.' });
  }

  const { table, action, id, data } = req.body || {};

  if (!ALLOWED_TABLES[table]) {
    return res.status(400).json({
      error: `Unknown table "${table}".`
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const allowedColumns = ALLOWED_TABLES[table];
  const cleanData = {};

  if (data) {
    for (const key of allowedColumns) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        cleanData[key] = data[key];
      }
    }
  }

  try {
    if (action === 'list') {
      const { data: rows, error } = await supabase
        .from(table)
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      return res.status(200).json({
        success: true,
        rows
      });
    }

    if (action === 'insert') {
      const { data: row, error } = await supabase
        .from(table)
        .insert(cleanData)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        row
      });
    }

    if (action === 'update') {
      if (table === 'settings') {
        const { data: row, error } = await supabase
          .from('settings')
          .update(cleanData)
          .eq('id', 1)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          row
        });
      }

      if (!id) {
        return res.status(400).json({
          error: 'Missing id for update.'
        });
      }

      const { data: row, error } = await supabase
        .from(table)
        .update(cleanData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        row
      });
    }

    if (action === 'delete') {
      if (!id) {
        return res.status(400).json({
          error: 'Missing id for delete.'
        });
      }

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true
      });
    }

    return res.status(400).json({
      error: `Unknown action "${action}".`
    });
  } catch (err) {
    console.error('admin/content error:', err);

    return res.status(500).json({
      error: err.message || 'Database error.'
    });
  }
}
