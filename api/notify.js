/**
 * /api/notify — receives Visit and Contact form submissions from the site,
 * sends an instant WhatsApp message to the church via CallMeBot, and
 * (optionally) logs a backup copy to the Google Sheet.
 *
 * Required environment variables (set in Vercel → Project → Settings → Environment Variables):
 *   CALLMEBOT_PHONE   - WhatsApp number that activated CallMeBot, no "+", e.g. 2349063646231
 *   CALLMEBOT_APIKEY  - the API key CallMeBot sends back after activation
 *
 * Optional:
 *   SHEET_WEBHOOK_URL - the Apps Script Web App URL, if you want submissions
 *                       backed up to a Sheet as well (recommended)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, name, email, date, message, page } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let text = '';
    if (type === 'visit') {
      text = `🙌 New Visit Plan Request\n\nName: ${name}\nEmail: ${email}\nSunday: ${date || 'Not specified'}`;
    } else {
      text = `✉️ New Contact Message\n\nName: ${name}\nEmail: ${email}\nMessage: ${message || '(none)'}`;
    }

    const phone = process.env.CALLMEBOT_PHONE;
    const apikey = process.env.CALLMEBOT_APIKEY;
    let whatsappSent = false;

    if (phone && apikey) {
      try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${apikey}`;
        const cmbRes = await fetch(url);
        whatsappSent = cmbRes.ok;
      } catch (err) {
        console.error('CallMeBot send failed:', err);
      }
    }

    const sheetWebhook = process.env.SHEET_WEBHOOK_URL;
    if (sheetWebhook) {
      // Fire-and-forget — a Sheet logging failure should not fail the whole request
      fetch(sheetWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name,
          email,
          date: date || '',
          message: message || '',
          page: page || '',
          submittedAt: new Date().toISOString()
        })
      }).catch((err) => console.error('Sheet backup failed:', err));
    }

    return res.status(200).json({ success: true, whatsappSent });
  } catch (err) {
    console.error('notify handler error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
