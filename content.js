/**
 * C.A.C.G. GLOBAL — LIVE CONTENT LOADER
 * Supabase-backed settings, sermons, events and ministries.
 *
 * Events are automatically separated by date:
 *   - event_date >= today -> Upcoming Programs
 *   - event_date < today  -> Previous Programs
 *
 * Anniversary content remains controlled by anniversary_enabled.
 */

const SUPABASE_URL = 'https://ergfvcminlpolxyirhff.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NCTFg53pQ4EC0I1vb0IasQ_Cu85Y3qC';
const CACG_CACHE_TTL_MS = 5 * 60 * 1000;

const cacgSupabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

async function cacgFetchTable(tableName) {
  const cacheKey = `cacg_cache_${tableName}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.savedAt < CACG_CACHE_TTL_MS) return parsed.data;
    }
  } catch (_) {}

  if (!cacgSupabase) return tableName === 'settings' ? null : [];

  try {
    let data;
    if (tableName === 'settings') {
      const { data: row, error } = await cacgSupabase.from('settings').select('*').single();
      if (error) throw error;
      data = row;
    } else {
      const dateColumn =
        tableName === 'sermons' ? 'sermon_date' :
        tableName === 'events' ? 'event_date' : null;

      let query = cacgSupabase.from(tableName).select('*').eq('published', true);
      if (dateColumn) query = query.order(dateColumn, { ascending: false });

      const { data: rows, error } = await query;
      if (error) throw error;
      data = rows;
    }

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ data, savedAt: Date.now() }));
    } catch (_) {}

    return data;
  } catch (err) {
    console.warn(`CACG content: could not load "${tableName}".`, err);
    return tableName === 'settings' ? null : [];
  }
}

function cacgEscapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function cacgEscapeAttr(value) {
  return cacgEscapeHtml(value).replace(/"/g, '&quot;');
}

function cacgSafeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cacgApplySettings(settings) {
  if (!settings) return;

  const textSettings = [
    'brand_short',
    'tagline',
    'who_we_are',
    'vision_eyebrow',
    'vision_title',
    'vision_text',
    'phone',
    'email',
    'address',
    'service_times',
    'bank_name',
    'account_number',
    'account_name'
  ];

  textSettings.forEach(key => {
    document.querySelectorAll(`[data-cacg="${key}"]`).forEach(el => {
      if (settings[key] !== null && settings[key] !== undefined && settings[key] !== '') {
        el.textContent = String(settings[key]);
      }
    });
  });

  document.querySelectorAll('[data-cacg="phone"]').forEach(el => {
    if (settings.phone) el.href = 'tel:' + String(settings.phone).replace(/[^\d+]/g, '');
  });

  document.querySelectorAll('[data-cacg="email"]').forEach(el => {
    if (settings.email) el.href = 'mailto:' + String(settings.email);
  });

  document.querySelectorAll('[data-cacg="phone-href"]').forEach(el => {
    if (settings.phone) el.href = 'tel:' + String(settings.phone).replace(/[^\d+]/g, '');
  });

  document.querySelectorAll('[data-cacg="whatsapp-href"]').forEach(el => {
    if (settings.whatsapp) {
      el.href = 'https://wa.me/' + String(settings.whatsapp).replace(/[^\d]/g, '');
    }
  });

  document.querySelectorAll('[data-cacg="account-copy-btn"]').forEach(el => {
    if (settings.account_number) el.setAttribute('data-copy', String(settings.account_number));
  });

  /*
   * Anniversary banner:
   * It is intentionally not part of the homepage markup anymore.
   * If another page still contains .anniversary-banner, this setting
   * continues to control it.
   */
  const banner = document.querySelector('.anniversary-banner');
  if (banner) {
    const enabled = settings.anniversary_enabled === true;
    banner.style.display = enabled ? '' : 'none';

    if (enabled) {
      const themeEl = banner.querySelector('[data-cacg="anniversary-theme"]');
      const detailsEl = banner.querySelector('[data-cacg="anniversary-details"]');

      if (themeEl && settings.anniversary_theme) {
        themeEl.textContent = String(settings.anniversary_theme);
      }

      if (detailsEl && (settings.anniversary_verse || settings.anniversary_details)) {
        detailsEl.innerHTML =
          `${cacgEscapeHtml(settings.anniversary_verse || '')}<br>` +
          `${cacgEscapeHtml(settings.anniversary_details || '')}`;
      }

      if (settings.anniversary_date && typeof window.cacgStartCountdown === 'function') {
        window.cacgStartCountdown(String(settings.anniversary_date));
      }
    }
  }
}

function cacgFormatDate(value, options = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: options.month || 'long',
    year: 'numeric'
  });
}

function cacgRenderSermons(sermons) {
  const grid = document.getElementById('sermonsGrid');
  if (!grid || !sermons || sermons.length === 0) return;

  grid.innerHTML = sermons.map(s => {
    const title = cacgEscapeHtml(s.title || 'Untitled Sermon');
    const titleAttr = cacgEscapeAttr(s.title || 'Sermon');
    const category = cacgEscapeHtml(s.category || '');
    const speaker = cacgEscapeHtml(s.speaker || '');
    const categoryAttr = cacgEscapeAttr((s.category || '').toLowerCase());
    const titleDataAttr = cacgEscapeAttr((s.title || '').toLowerCase());
    const youtubeUrl = cacgSafeUrl(s.youtube_link);
    const audioUrl = cacgSafeUrl(s.audio_file);

    let thumbHtml = '';
    if (youtubeUrl) {
      thumbHtml = `<div class="thumb"><iframe loading="lazy" src="${cacgEscapeAttr(youtubeUrl)}" title="${titleAttr}" allowfullscreen></iframe></div>`;
    } else if (audioUrl) {
      thumbHtml = `
        <div class="thumb sermon-audio-only">
          <div class="sermon-audio-label">Audio Message</div>
        </div>`;
    } else {
      thumbHtml = `<div class="thumb sermon-video-static"><img src="images/pastor-preaching.jpg" alt="Sermon coming soon"><div class="sermon-video-label">Coming Soon</div></div>`;
    }

    return `
      <div class="sermon-card" data-category="${categoryAttr}" data-title="${titleDataAttr}">
        ${thumbHtml}
        <div class="body">
          <span class="date">${cacgFormatDate(s.sermon_date)}</span>
          <h3>${title}</h3>
          <p>${speaker}${speaker && category ? ' · ' : ''}${category}</p>
          ${audioUrl ? `<audio controls preload="none" style="width:100%;margin-top:12px"><source src="${cacgEscapeAttr(audioUrl)}"></audio>` : ''}
          ${audioUrl ? `<div class="actions"><a href="${cacgEscapeAttr(audioUrl)}" download target="_blank" rel="noopener">Download MP3</a></div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function cacgRenderEventCard(ev, past = false) {
  const d = ev.event_date ? new Date(ev.event_date) : null;
  const day = d && !Number.isNaN(d.getTime()) ? d.getDate() : '';
  const month = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { month: 'short' }) : '';
  const title = cacgEscapeHtml(ev.title || 'Untitled Program');
  const titleAttr = cacgEscapeAttr(ev.title || 'Program');
  const time = cacgEscapeHtml(ev.event_time || '');
  const location = cacgEscapeHtml(ev.location || '');
  const description = cacgEscapeHtml(ev.description || '');
  const imageUrl = cacgSafeUrl(ev.image_url);
  const videoUrl = cacgSafeUrl(ev.video_url);

  if (past) {
    const media = imageUrl
      ? `<img src="${cacgEscapeAttr(imageUrl)}" alt="${titleAttr}" loading="lazy">`
      : `<div class="previous-placeholder">C.A.C.G. GLOBAL</div>`;

    return `
      <article class="previous-program-card">
        ${media}
        <div class="previous-program-body">
          <span class="program-status">Past Program</span>
          <h3>${title}</h3>
          ${description ? `<p>${description}</p>` : ''}
          <p>${d ? cacgFormatDate(ev.event_date) : ''}${time ? ' · ' + time : ''}</p>
          ${location ? `<p>${location}</p>` : ''}
        </div>
      </article>`;
  }

  const mediaHtml = videoUrl
    ? `<div class="event-media"><iframe loading="lazy" src="${cacgEscapeAttr(videoUrl.replace('watch?v=', 'embed/'))}" title="${titleAttr}" allowfullscreen></iframe></div>`
    : imageUrl
      ? `<div class="event-media"><img src="${cacgEscapeAttr(imageUrl)}" alt="${titleAttr}" loading="lazy"></div>`
      : '';

  return `
    <article class="event-card">
      <div class="event-date">
        <span class="day">${day}</span>
        <span class="month">${month}</span>
      </div>
      <div>
        <h3>${title}</h3>
        <p>${d ? cacgFormatDate(ev.event_date) : ''}${time ? ' · ' + time : ''}${location ? ' · ' + location : ''}</p>
        ${description ? `<p>${description}</p>` : ''}
        ${mediaHtml}
      </div>
    </article>`;
}

function cacgRenderEvents(events) {
  const upcomingGrid = document.getElementById('upcomingEventsGrid');
  const previousGrid = document.getElementById('previousProgramsGrid');

  if (!upcomingGrid && !previousGrid) return;

  const list = Array.isArray(events) ? events : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = list
    .filter(ev => ev.event_date && new Date(ev.event_date) >= today)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  const previous = list
    .filter(ev => ev.event_date && new Date(ev.event_date) < today)
    .sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

  if (upcomingGrid) {
    upcomingGrid.innerHTML = upcoming.length
      ? upcoming.map(ev => cacgRenderEventCard(ev, false)).join('')
      : `<div class="empty-state"><h3>No upcoming programs published yet.</h3><p>New programs will appear here when they are added from the content dashboard.</p></div>`;
  }

  if (previousGrid) {
    previousGrid.innerHTML = previous.length
      ? previous.map(ev => cacgRenderEventCard(ev, true)).join('')
      : `<div class="empty-state"><h3>No previous programs yet.</h3><p>Completed programs will automatically appear here after their event date.</p></div>`;
  }
}

function cacgRenderMinistries(ministries) {
  const grid = document.getElementById('ministriesGrid');
  if (!grid || !ministries || ministries.length === 0) return;

  grid.innerHTML = ministries.map(m => {
    const categoryAttr = cacgEscapeAttr((m.category || '').toLowerCase());
    const category = cacgEscapeHtml(m.category || '');
    const name = cacgEscapeHtml(m.name || 'Untitled Ministry');
    const description = cacgEscapeHtml(m.description || '');

    return `
      <div class="ministry-card" data-category="${categoryAttr}">
        <div class="ministry-media">✦</div>
        <div class="ministry-body">
          <span class="tag">${category}</span>
          <h3>${name}</h3>
          <p>${description}</p>
        </div>
      </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const needsSermons = !!document.getElementById('sermonsGrid');
  const needsEvents =
    !!document.getElementById('upcomingEventsGrid') ||
    !!document.getElementById('previousProgramsGrid') ||
    !!document.getElementById('eventsGrid');
  const needsMinistries = !!document.getElementById('ministriesGrid');

  const [settingsResult, sermonsResult, eventsResult, ministriesResult] =
    await Promise.allSettled([
      cacgFetchTable('settings'),
      needsSermons ? cacgFetchTable('sermons') : Promise.resolve(null),
      needsEvents ? cacgFetchTable('events') : Promise.resolve(null),
      needsMinistries ? cacgFetchTable('ministries') : Promise.resolve(null)
    ]);

  try {
    if (settingsResult.status === 'fulfilled') {
      cacgApplySettings(settingsResult.value);
    }
  } catch (err) {
    console.warn('CACG content: settings failed to apply.', err);
  }

  try {
    if (needsSermons && sermonsResult.status === 'fulfilled') {
      cacgRenderSermons(sermonsResult.value);
    }
  } catch (err) {
    console.warn('CACG content: sermons failed to render.', err);
  }

  try {
    if (needsEvents && eventsResult.status === 'fulfilled') {
      cacgRenderEvents(eventsResult.value);
    }
  } catch (err) {
    console.warn('CACG content: events failed to render.', err);
  }

  try {
    if (needsMinistries && ministriesResult.status === 'fulfilled') {
      cacgRenderMinistries(ministriesResult.value);
    }
  } catch (err) {
    console.warn('CACG content: ministries failed to render.', err);
  }
});
