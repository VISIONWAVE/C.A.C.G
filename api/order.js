/**
 * /api/order — public endpoint for the Ebenezer cloth ordering page.
 *
 * action "create": validates the order, saves it to cloth_orders (status
 *                  "pending"), emails the church, returns the order id.
 * action "claim": customer says they've made the transfer -> status
 *                 becomes "payment_claimed" and the church is emailed.
 *
 * Saving happens here on the server with the service role key.
 */

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

async function emailChurch(subject, text) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.warn('order email skipped: GMAIL_USER / GMAIL_APP_PASSWORD not set');
      return;
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"C.A.C.G. Orders" <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFY_TO_EMAIL || process.env.GMAIL_USER,
      subject,
      text,
    });
  } catch (err) {
    console.error('order email failed:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const body = req.body || {};

  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    if (body.action === 'create') {
      const name = clean(body.name, 80);
      const phone = clean(body.phone, 20);
      const size = clean(body.size, 30);
      const quantity = Number(body.quantity);

      if (name.length < 2) return res.status(400).json({ ok: false, error: 'Please enter your name.' });
      if (!/^\+?[\d\s-]{7,20}$/.test(phone)) return res.status(400).json({ ok: false, error: 'Please enter a valid phone number.' });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return res.status(400).json({ ok: false, error: 'Quantity must be between 1 and 50.' });
      }

      const { data: order, error } = await supabase
        .from('cloth_orders')
        .insert({ name, phone, quantity, size: size || null, status: 'pending' })
        .select()
        .single();
      if (error) throw error;

      await emailChurch(
        `New polo order #${order.id} — ${name}`,
        `New Ebenezer 2026 polo order (awaiting payment)\n\nOrder: EBN-${order.id}\nName: ${name}\nPhone: ${phone}\nQuantity: ${quantity}\nSize: ${size || '—'}\n\nManage it in the admin: /admin/orders.html`
      );

      return res.status(200).json({ ok: true, id: order.id, reference: `EBN-${order.id}` });
    }

    if (body.action === 'claim') {
      const id = Number(body.id);
      const phone = clean(body.phone, 20);
      if (!Number.isInteger(id) || !phone) return res.status(400).json({ ok: false, error: 'Invalid request.' });

      const { data: order, error } = await supabase
        .from('cloth_orders')
        .update({ status: 'payment_claimed' })
        .eq('id', id)
        .eq('phone', phone)
        .eq('status', 'pending')
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!order) return res.status(200).json({ ok: true });

      await emailChurch(
        `Payment claimed — order #${order.id} (${order.name})`,
        `${order.name} says they have paid for order EBN-${order.id}.\n\nPhone: ${order.phone}\nQuantity: ${order.quantity}\nSize: ${order.size || '—'}\n\nPlease check your bank, then mark it "Paid" in /admin/orders.html`
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    console.error('order error:', err);
    return res.status(500).json({ ok: false, error: 'Could not save your order. Please try again.' });
  }
}