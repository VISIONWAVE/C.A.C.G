// api/notify.js
// Handles POST /api/notify — sends email notifications for two separate
// public forms:
//   type: "visit"   — Plan a Visit modal (booking itself is saved directly
//                      to Supabase by the client; this endpoint only emails)
//   type: "contact"  — Contact page form (this endpoint both forwards the
//                      message to the church and confirms receipt to the
//                      sender — there is no database row for these)

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail "App Password", not the login password
  },
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const churchNotifyTo = () => process.env.NOTIFY_TO_EMAIL || process.env.GMAIL_USER;

async function handleVisit(body, res) {
  const { name, email, date, page } = body;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedDate = typeof date === 'string' ? date.trim() : '';

  if (trimmedName.length < 2 || !emailPattern.test(trimmedEmail) || !trimmedDate) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const formattedDate = new Date(`${trimmedDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const emailJobs = [
    transporter.sendMail({
      from: `"C.A.C.G. Website" <${process.env.GMAIL_USER}>`,
      to: churchNotifyTo(),
      subject: `New Plan a Visit: ${trimmedName} — ${formattedDate}`,
      text: `${trimmedName} plans to visit on ${formattedDate}.\n\nEmail: ${trimmedEmail}\nSubmitted from: ${page || 'unknown page'}\n\nStatus starts as "pending" — update it from the admin dashboard's Visits tab.`,
    }),
    transporter.sendMail({
      from: `"Christ Alone Christian Group and Prophetic Ministry" <${process.env.GMAIL_USER}>`,
      to: trimmedEmail,
      subject: `See you ${formattedDate}!`,
      text: `Hi ${trimmedName},\n\nThank you for letting us know you're planning to visit on ${formattedDate}. We can't wait to welcome you!\n\nService details:\n- Sunday School: 8am\n- Glorious Service: 9am\n\nLocation: Opp Poly Third Gate, Irepodun CDA Area, Sarumi, Ilaro, Ogun State\n\nWe'll email you again if anything about your visit is confirmed or changes.\n\nIf you have any questions before then, just reply to this email or call us on +234 906 364 6231.\n\nSee you soon,\nC.A.C.G. Family`,
    }),
  ];

  const results = await Promise.allSettled(emailJobs);
  const emailFailed = results.some((r) => r.status === 'rejected');
  if (emailFailed) {
    console.error('One or more visit emails failed to send:', results);
  }

  return res.status(200).json({ ok: true, emailSent: !emailFailed });
}

async function handleContact(body, res) {
  const { name, email, message, page } = body;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (trimmedName.length < 2 || !emailPattern.test(trimmedEmail) || trimmedMessage.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const emailJobs = [
    transporter.sendMail({
      from: `"C.A.C.G. Website" <${process.env.GMAIL_USER}>`,
      to: churchNotifyTo(),
      replyTo: trimmedEmail,
      subject: `New Contact Form message from ${trimmedName}`,
      text: `${trimmedName} sent a message via the Contact page.\n\nEmail: ${trimmedEmail}\nSubmitted from: ${page || 'unknown page'}\n\nMessage:\n${trimmedMessage}`,
    }),
    transporter.sendMail({
      from: `"Christ Alone Christian Group and Prophetic Ministry" <${process.env.GMAIL_USER}>`,
      to: trimmedEmail,
      subject: `We received your message`,
      text: `Hi ${trimmedName},\n\nThanks for reaching out — we've received your message and will get back to you within 48 hours.\n\nYour message:\n${trimmedMessage}\n\nIf it's urgent, call or WhatsApp our prayer line: +234 906 364 6231.\n\nC.A.C.G. Family`,
    }),
  ];

  const results = await Promise.allSettled(emailJobs);
  const emailFailed = results.some((r) => r.status === 'rejected');
  if (emailFailed) {
    console.error('One or more contact emails failed to send:', results);
  }

  return res.status(200).json({ ok: true, emailSent: !emailFailed });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  if (body.type === 'visit') return handleVisit(body, res);
  if (body.type === 'contact') return handleContact(body, res);

  return res.status(400).json({ error: 'Unsupported notification type' });
}
