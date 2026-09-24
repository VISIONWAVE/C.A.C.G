// api/notify.js
// Handles POST /api/notify — currently only the "visit" type from the
// "Plan a Visit" modal on index.html. Saves the request to Supabase and
// sends a notification email to the church plus a confirmation to the visitor.

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role key — server-side only, never expose to the browser
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail "App Password", not the login password
  },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, name, email, date, page } = req.body || {};

  if (type !== 'visit') {
    return res.status(400).json({ error: 'Unsupported notification type' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedDate = typeof date === 'string' ? date.trim() : '';
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (trimmedName.length < 2 || !emailPattern.test(trimmedEmail) || !trimmedDate) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  // 1. Save to Supabase first — this is the record of truth even if email fails.
  try {
    const { error: dbError } = await supabase
      .from('visit_requests')
      .insert({
        name: trimmedName,
        email: trimmedEmail,
        visit_date: trimmedDate,
        page: typeof page === 'string' ? page : null,
      });

    if (dbError) throw dbError;
  } catch (err) {
    console.error('Supabase insert failed:', err);
    return res.status(500).json({ error: 'Could not save visit request' });
  }

  const formattedDate = new Date(`${trimmedDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const churchNotifyTo = process.env.NOTIFY_TO_EMAIL || process.env.GMAIL_USER;

  const emailJobs = [
    transporter.sendMail({
      from: `"C.A.C.G. Website" <${process.env.GMAIL_USER}>`,
      to: churchNotifyTo,
      subject: `New Plan a Visit: ${trimmedName} — ${formattedDate}`,
      text: `${trimmedName} plans to visit on ${formattedDate}.\n\nEmail: ${trimmedEmail}\nSubmitted from: ${page || 'unknown page'}`,
    }),
    transporter.sendMail({
      from: `"Christ Alone Christian Group and Prophetic Ministry" <${process.env.GMAIL_USER}>`,
      to: trimmedEmail,
      subject: `See you ${formattedDate}!`,
      text: `Hi ${trimmedName},\n\nThank you for letting us know you're planning to visit on ${formattedDate}. We can't wait to welcome you!\n\nService details:\n- Sunday School: 8am\n- Glorious Service: 9am\n\nLocation: Opp Poly Third Gate, Irepodun CDA Area, Sarumi, Ilaro, Ogun State\n\nIf you have any questions before then, just reply to this email or call us on +234 906 364 6231.\n\nSee you soon,\nC.A.C.G. Family`,
    }),
  ];

  const results = await Promise.allSettled(emailJobs);
  const emailFailed = results.some((r) => r.status === 'rejected');
  if (emailFailed) {
    console.error('One or more visit emails failed to send:', results);
    // Don't fail the request — the visit is already saved in Supabase.
  }

  return res.status(200).json({ ok: true, emailSent: !emailFailed });
};
