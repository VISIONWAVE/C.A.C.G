/**
 * CACG WEBSITE — LIVE CONTENT LOADER
 * -----------------------------------
 * Pulls Sermons, Events, Ministries, and Settings from the Google Sheet
 * (via the Apps Script Web App) and updates the page after it loads.
 *
 * If the fetch fails (no internet, script not deployed yet, etc.) the page
 * simply keeps showing its built-in fallback content — nothing breaks.
 */

// PASTE YOUR APPS SCRIPT WEB APP URL BELOW (see admin-setup/SETUP-INSTRUCTIONS.md)
const CACG_API_URL = 'https://script.google.com/macros/s/AKfycbxkmApSbepJodXM2s2SYzWDeDu02lFmMA2brWtj6_yRfJLU2KuhZ0jTjTmNMT7xIIk/exec';

async function cacgFetchSheet(sheetName) {
  if (!CACG_API_URL || CACG_API_URL.indexOf('PASTE_YOUR') !== -1) {
    return sheetName === 'Settings' ? {} : [];
  }
  try {
    const res = await fetch(`${CACG_API_URL}?sheet=${sheetName}`);
    if (!res.ok) throw new Error('Network response was not ok');
    return await res.json();
  } catch (err) {
    console.warn(`CACG content: could not load "${sheetName}", keeping fallback content.`, err);
    return sheetName === 'Settings' ? {} : [];
  }
}

function cacgApplySettings(settings) {
  if (!settings || Object.keys(settings).length === 0) return;

  // Elements whose visible text IS the value (phone number / email address shown as-is)
  // Values coming from the Sheet may arrive as numbers (e.g. an all-digit phone
  // number), so everything is wrapped in String() before using text methods like .replace().
  document.querySelectorAll('[data-cacg="phone"]').forEach((el) => {
    if (settings.Phone) {
      el.textContent = String(settings.Phone);
      el.href = 'tel:' + String(settings.Phone).replace(/[^\d+]/g, '');
    }
  });
  document.querySelectorAll('[data-cacg="email"]').forEach((el) => {
    if (settings.Email) {
      el.textContent = String(settings.Email);
      el.href = 'mailto:' + String(settings.Email);
    }
  });

  // Elements that are buttons/labels (e.g. "Call Prayer Line") — only the link target changes
  document.querySelectorAll('[data-cacg="phone-href"]').forEach((el) => {
    if (settings.Phone) el.href = 'tel:' + String(settings.Phone).replace(/[^\d+]/g, '');
  });
  document.querySelectorAll('[data-cacg="whatsapp-href"]').forEach((el) => {
    if (settings.WhatsApp) el.href = 'https://wa.me/' + String(settings.WhatsApp).replace(/[^\d]/g, '');
  });

  document.querySelectorAll('[data-cacg="address"]').forEach((el) => {
    if (settings.Address) el.textContent = String(settings.Address);
  });
  document.querySelectorAll('[data-cacg="service-times"]').forEach((el) => {
    if (settings.ServiceTimes) el.textContent = String(settings.ServiceTimes);
  });
  document.querySelectorAll('[data-cacg="bank-name"]').forEach((el) => {
    if (settings.BankName) el.textContent = String(settings.BankName);
  });
  document.querySelectorAll('[data-cacg="account-number"]').forEach((el) => {
    if (settings.AccountNumber) el.textContent = String(settings.AccountNumber);
  });
  document.querySelectorAll('[data-cacg="account-copy-btn"]').forEach((el) => {
    if (settings.AccountNumber) el.setAttribute('data-copy', String(settings.AccountNumber));
  });
  document.querySelectorAll('[data-cacg="account-name"]').forEach((el) => {
    if (settings.AccountName) el.textContent = String(settings.AccountName);
  });

  // Anniversary banner: show/hide + fill content + drive the countdown
  const banner = document.querySelector('.anniversary-banner');
  if (banner) {
    const enabled = String(settings.AnniversaryEnabled || '').trim().toLowerCase() === 'yes';
    banner.style.display = enabled ? '' : 'none';
    if (enabled) {
      const themeEl = banner.querySelector('[data-cacg="anniversary-theme"]');
      const detailsEl = banner.querySelector('[data-cacg="anniversary-details"]');
      if (themeEl && settings.AnniversaryTheme) themeEl.textContent = String(settings.AnniversaryTheme);
      if (detailsEl && (settings.AnniversaryVerse || settings.AnniversaryDetails)) {
        detailsEl.innerHTML = `${settings.AnniversaryVerse || ''}<br>${settings.AnniversaryDetails || ''}`;
      }
      if (settings.AnniversaryDate && typeof window.cacgStartCountdown === 'function') {
        window.cacgStartCountdown(String(settings.AnniversaryDate));
      }
    }
  }
}

function cacgRenderSermons(sermons) {
  const grid = document.getElementById('sermonsGrid') || document.getElementById('latestSermonSlot');
  if (!grid || !sermons || sermons.length === 0) return; // keep fallback content if nothing published yet

  // Full sermons grid (sermons.html)
  const fullGrid = document.getElementById('sermonsGrid');
  if (fullGrid) {
    fullGrid.innerHTML = sermons.map((s) => `
      <div class="sermon-card" data-category="${(s.Category || '').toLowerCase()}" data-title="${(s.Title || '').toLowerCase()}">
        <div class="thumb ${s.YouTubeLink ? '' : 'sermon-video-static'}">
          ${s.YouTubeLink
            ? `<iframe loading="lazy" data-src="${s.YouTubeLink}" title="${s.Title || 'Sermon'}" allowfullscreen></iframe>`
            : `<img src="images/pastor-preaching.jpg" alt="Sermon video coming soon"><div class="sermon-video-label">Video Coming Soon</div>`}
        </div>
        <div class="body">
          <span class="date">${s.Date ? new Date(s.Date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
          <h3>${s.Title || 'Untitled Sermon'}</h3>
          <p>${s.Speaker || ''} &middot; ${s.Category || ''}</p>
          <div class="actions">
            ${s.AudioFile ? `<a href="${s.AudioFile}" download target="_blank" rel="noopener">Download MP3</a>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Re-run lazy load for any newly inserted real iframes
    const lazyIframes = fullGrid.querySelectorAll('iframe[data-src]');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.src = entry.target.getAttribute('data-src');
            entry.target.removeAttribute('data-src');
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '150px' });
      lazyIframes.forEach((el) => io.observe(el));
    }
  }
}

function cacgRenderEvents(events) {
  const grid = document.getElementById('eventsGrid');
  if (!grid || !events || events.length === 0) return; // keep fallback content if nothing published yet

  grid.innerHTML = events.map((ev) => {
    const d = ev.Date ? new Date(ev.Date) : null;
    const day = d ? d.getDate() : '';
    const month = d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '';
    return `
      <div class="event-card">
        <div class="event-date"><span class="day">${day}</span><span class="month">${month}</span></div>
        <div>
          <h3>${ev.Title || 'Untitled Event'}</h3>
          <p>${d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''}${ev.Time ? ' &middot; ' + ev.Time : ''}${ev.Location ? ' &middot; ' + ev.Location : ''}</p>
          <p>${ev.Description || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

function cacgRenderMinistries(ministries) {
  const grid = document.getElementById('ministriesGrid');
  if (!grid || !ministries || ministries.length === 0) return; // keep fallback content if nothing published yet

  grid.innerHTML = ministries.map((m) => `
    <div class="ministry-card" data-category="${(m.Category || '').toLowerCase()}">
      <div class="ministry-media">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/></svg>
      </div>
      <div class="ministry-body">
        <span class="tag">${m.Category || ''}</span>
        <h3>${m.Name || 'Untitled Ministry'}</h3>
        <p>${m.Description || ''}</p>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const settings = await cacgFetchSheet('Settings');
    cacgApplySettings(settings);
  } catch (err) {
    console.warn('CACG content: Settings failed to apply, keeping fallback content.', err);
  }

  try {
    if (document.getElementById('sermonsGrid')) {
      cacgRenderSermons(await cacgFetchSheet('Sermons'));
    }
  } catch (err) {
    console.warn('CACG content: Sermons failed to render, keeping fallback content.', err);
  }

  try {
    if (document.getElementById('eventsGrid')) {
      cacgRenderEvents(await cacgFetchSheet('Events'));
    }
  } catch (err) {
    console.warn('CACG content: Events failed to render, keeping fallback content.', err);
  }

  try {
    if (document.getElementById('ministriesGrid')) {
      cacgRenderMinistries(await cacgFetchSheet('Ministries'));
    }
  } catch (err) {
    console.warn('CACG content: Ministries failed to render, keeping fallback content.', err);
  }
});
