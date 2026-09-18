/**
 * CACG WEBSITE — LIVE CONTENT LOADER (Supabase version)
 * -----------------------------------------------------
 * Pulls Sermons, Events, Ministries, and Settings from Supabase and
 * updates the page after it loads. Replaces the old Google Sheets/Apps
 * Script backend for speed — Supabase is a real database, no per-call
 * cold-start delay like Apps Script had.
 *
 * If a fetch fails (no internet, misconfigured project, etc.) the page
 * simply keeps showing its built-in fallback content — nothing breaks.
 *
 * Requires the Supabase JS client to be loaded on the page BEFORE this
 * file, via:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

const SUPABASE_URL = 'https://ergfvcminlpolxyirhff.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NCTFg53pQ4EC0I1vb0IasQ_Cu85Y3qC';
const CACG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cacgSupabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

async function cacgFetchTable(tableName) {
  const cacheKey = `cacg_cache_${tableName}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, savedAt } = JSON.parse(cached);
      if (Date.now() - savedAt < CACG_CACHE_TTL_MS) {
        return data;
      }
    }
  } catch (err) {
    // sessionStorage unavailable (private browsing, etc.) — just skip caching
  }

  if (!cacgSupabase) {
    console.warn('CACG content: Supabase client not available, keeping fallback content.');
    return tableName === 'settings' ? null : [];
  }

  try {
    let data;

    if (tableName === 'settings') {
      const { data: row, error } = await cacgSupabase.from('settings').select('*').single();
      if (error) throw error;
      data = row;
    } else {
      const dateColumn = tableName === 'sermons' ? 'sermon_date' : tableName === 'events' ? 'event_date' : null;
      let query = cacgSupabase.from(tableName).select('*').eq('published', true);
      if (dateColumn) query = query.order(dateColumn, { ascending: false });
      const { data: rows, error } = await query;
      if (error) throw error;
      data = rows;
    }

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ data, savedAt: Date.now() }));
    } catch (err) {
      // storage full or unavailable — not critical, just skip caching this time
    }
    return data;
  } catch (err) {
    console.warn(`CACG content: could not load "${tableName}", keeping fallback content.`, err);
    return tableName === 'settings' ? null : [];
  }
}

function cacgApplySettings(settings) {
  if (!settings) return;

  document.querySelectorAll('[data-cacg="phone"]').forEach((el) => {
    if (settings.phone) {
      el.textContent = String(settings.phone);
      el.href = 'tel:' + String(settings.phone).replace(/[^\d+]/g, '');
    }
  });
  document.querySelectorAll('[data-cacg="email"]').forEach((el) => {
    if (settings.email) {
      el.textContent = String(settings.email);
      el.href = 'mailto:' + String(settings.email);
    }
  });
  document.querySelectorAll('[data-cacg="phone-href"]').forEach((el) => {
    if (settings.phone) el.href = 'tel:' + String(settings.phone).replace(/[^\d+]/g, '');
  });
  document.querySelectorAll('[data-cacg="whatsapp-href"]').forEach((el) => {
    if (settings.whatsapp) el.href = 'https://wa.me/' + String(settings.whatsapp).replace(/[^\d]/g, '');
  });
  document.querySelectorAll('[data-cacg="address"]').forEach((el) => {
    if (settings.address) el.textContent = String(settings.address);
  });
  document.querySelectorAll('[data-cacg="service-times"]').forEach((el) => {
    if (settings.service_times) el.textContent = String(settings.service_times);
  });
  document.querySelectorAll('[data-cacg="bank-name"]').forEach((el) => {
    if (settings.bank_name) el.textContent = String(settings.bank_name);
  });
  document.querySelectorAll('[data-cacg="account-number"]').forEach((el) => {
    if (settings.account_number) el.textContent = String(settings.account_number);
  });
  document.querySelectorAll('[data-cacg="account-copy-btn"]').forEach((el) => {
    if (settings.account_number) el.setAttribute('data-copy', String(settings.account_number));
  });
  document.querySelectorAll('[data-cacg="account-name"]').forEach((el) => {
    if (settings.account_name) el.textContent = String(settings.account_name);
  });

  const banner = document.querySelector('.anniversary-banner');
  if (banner) {
    const enabled = settings.anniversary_enabled === true;
    banner.style.display = enabled ? '' : 'none';
    if (enabled) {
      const themeEl = banner.querySelector('[data-cacg="anniversary-theme"]');
      const detailsEl = banner.querySelector('[data-cacg="anniversary-details"]');
      if (themeEl && settings.anniversary_theme) themeEl.textContent = settings.anniversary_theme;
      if (detailsEl && (settings.anniversary_verse || settings.anniversary_details)) {
        detailsEl.innerHTML = `${settings.anniversary_verse || ''}<br>${settings.anniversary_details || ''}`;
      }
      if (settings.anniversary_date && typeof window.cacgStartCountdown === 'function') {
        window.cacgStartCountdown(String(settings.anniversary_date));
      }
    }
  }
}

function cacgRenderSermons(sermons) {
  const fullGrid = document.getElementById('sermonsGrid');
  if (!fullGrid || !sermons || sermons.length === 0) return; // keep fallback content if nothing published yet

  fullGrid.innerHTML = sermons.map((s) => `
    <div class="sermon-card" data-category="${(s.category || '').toLowerCase()}" data-title="${(s.title || '').toLowerCase()}">
      <div class="thumb ${s.youtube_link ? '' : 'sermon-video-static'}">
        ${s.youtube_link
          ? `<iframe loading="lazy" data-src="${s.youtube_link}" title="${s.title || 'Sermon'}" allowfullscreen></iframe>`
          : `<img src="images/pastor-preaching.jpg" alt="Sermon video coming soon"><div class="sermon-video-label">Video Coming Soon</div>`}
      </div>
      <div class="body">
        <span class="date">${s.sermon_date ? new Date(s.sermon_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
        <h3>${s.title || 'Untitled Sermon'}</h3>
        <p>${s.speaker || ''} &middot; ${s.category || ''}</p>
        <div class="actions">
          ${s.audio_file ? `<a href="${s.audio_file}" download target="_blank" rel="noopener">Download MP3</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');

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

function cacgRenderEvents(events) {
  const grid = document.getElementById('eventsGrid');
  if (!grid || !events || events.length === 0) return; // keep fallback content if nothing published yet

  grid.innerHTML = events.map((ev) => {
    const d = ev.event_date ? new Date(ev.event_date) : null;
    const day = d ? d.getDate() : '';
    const month = d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '';
    return `
      <div class="event-card">
        <div class="event-date"><span class="day">${day}</span><span class="month">${month}</span></div>
        <div>
          <h3>${ev.title || 'Untitled Event'}</h3>
          <p>${d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''}${ev.event_time ? ' &middot; ' + ev.event_time : ''}${ev.location ? ' &middot; ' + ev.location : ''}</p>
          <p>${ev.description || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

function cacgRenderMinistries(ministries) {
  const grid = document.getElementById('ministriesGrid');
  if (!grid || !ministries || ministries.length === 0) return; // keep fallback content if nothing published yet

  grid.innerHTML = ministries.map((m) => `
    <div class="ministry-card" data-category="${(m.category || '').toLowerCase()}">
      <div class="ministry-media">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/></svg>
      </div>
      <div class="ministry-body">
        <span class="tag">${m.category || ''}</span>
        <h3>${m.name || 'Untitled Ministry'}</h3>
        <p>${m.description || ''}</p>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const needsSermons = !!document.getElementById('sermonsGrid');
  const needsEvents = !!document.getElementById('eventsGrid');
  const needsMinistries = !!document.getElementById('ministriesGrid');

  const [settingsResult, sermonsResult, eventsResult, ministriesResult] = await Promise.allSettled([
    cacgFetchTable('settings'),
    needsSermons ? cacgFetchTable('sermons') : Promise.resolve(null),
    needsEvents ? cacgFetchTable('events') : Promise.resolve(null),
    needsMinistries ? cacgFetchTable('ministries') : Promise.resolve(null),
  ]);

  try {
    if (settingsResult.status === 'fulfilled') cacgApplySettings(settingsResult.value);
  } catch (err) {
    console.warn('CACG content: Settings failed to apply, keeping fallback content.', err);
  }

  try {
    if (needsSermons && sermonsResult.status === 'fulfilled') cacgRenderSermons(sermonsResult.value);
  } catch (err) {
    console.warn('CACG content: Sermons failed to render, keeping fallback content.', err);
  }

  try {
    if (needsEvents && eventsResult.status === 'fulfilled') cacgRenderEvents(eventsResult.value);
  } catch (err) {
    console.warn('CACG content: Events failed to render, keeping fallback content.', err);
  }

  try {
    if (needsMinistries && ministriesResult.status === 'fulfilled') cacgRenderMinistries(ministriesResult.value);
  } catch (err) {
    console.warn('CACG content: Ministries failed to render, keeping fallback content.', err);
  }
});
