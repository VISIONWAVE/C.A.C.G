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
      else if (tableName === 'spotlight_slides') query = query.order('display_order', { ascending: true });
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

/**
 * Escapes text before it's inserted into innerHTML. Sermons/Events/
 * Ministries now come from an admin dashboard where anyone with the
 * password can type free-text into title/description/etc. fields — and
 * event video_url/image_url get dropped straight into an iframe/img `src`
 * attribute. Nothing here stops a stray `<script>` or a quote character
 * that breaks out of an attribute, so escape everything on the way in.
 */
function cacgEscapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

/** Same, but also escapes double quotes — use this for anything that
 *  lands inside a quoted HTML attribute (href, src, data-*, title). */
function cacgEscapeAttr(value) {
  return cacgEscapeHtml(value).replace(/"/g, '&quot;');
}

/** Only allow http(s) URLs through into src/href attributes — blocks
 *  "javascript:" and other schemes someone could type into a Video/Image
 *  URL field to run script when a visitor's browser loads the page. */
function cacgSafeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
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
        detailsEl.innerHTML = `${cacgEscapeHtml(settings.anniversary_verse || '')}<br>${cacgEscapeHtml(settings.anniversary_details || '')}`;
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

  fullGrid.innerHTML = sermons.map((s) => {
    const title = cacgEscapeHtml(s.title || 'Untitled Sermon');
    const titleAttr = cacgEscapeAttr(s.title || 'Sermon');
    const category = cacgEscapeHtml(s.category || '');
    const speaker = cacgEscapeHtml(s.speaker || '');
    const categoryAttr = cacgEscapeAttr((s.category || '').toLowerCase());
    const titleDataAttr = cacgEscapeAttr((s.title || '').toLowerCase());
    const youtubeUrl = cacgSafeUrl(s.youtube_link);
    const audioUrl = cacgSafeUrl(s.audio_file);

    let thumbHtml;
    if (youtubeUrl) {
      thumbHtml = `<div class="thumb"><iframe loading="lazy" data-src="${cacgEscapeAttr(youtubeUrl)}" title="${titleAttr}" allowfullscreen></iframe></div>`;
    } else if (audioUrl) {
      // Audio exists — show a clean audio-focused card, no "coming soon" messaging since content is genuinely available
      thumbHtml = `
        <div class="thumb sermon-audio-only">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M9 18V5L20 3V16" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.6"/></svg>
          <div class="sermon-audio-label">Audio Message</div>
        </div>`;
    } else {
      // Genuinely nothing uploaded yet
      thumbHtml = `<div class="thumb sermon-video-static"><img src="images/pastor-preaching.jpg" alt="Sermon coming soon"><div class="sermon-video-label">Coming Soon</div></div>`;
    }

    return `
    <div class="sermon-card" data-category="${categoryAttr}" data-title="${titleDataAttr}">
      ${thumbHtml}
      <div class="body">
        <span class="date">${s.sermon_date ? new Date(s.sermon_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
        <h3>${title}</h3>
        <p>${speaker} &middot; ${category}</p>
        ${audioUrl ? `<audio controls preload="none" style="width:100%; margin-top:12px;"><source src="${cacgEscapeAttr(audioUrl)}" /></audio>` : ''}
        <div class="actions">
          ${audioUrl ? `<a href="${cacgEscapeAttr(audioUrl)}" download target="_blank" rel="noopener">Download MP3</a>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

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
    const title = cacgEscapeHtml(ev.title || 'Untitled Event');
    const titleAttr = cacgEscapeAttr(ev.title || 'Event');
    const time = cacgEscapeHtml(ev.event_time || '');
    const location = cacgEscapeHtml(ev.location || '');
    const description = cacgEscapeHtml(ev.description || '');
    const videoUrl = cacgSafeUrl(ev.video_url);
    const imageUrl = cacgSafeUrl(ev.image_url);
    const mediaHtml = videoUrl
      ? `<div class="event-media"><iframe loading="lazy" src="${cacgEscapeAttr(videoUrl.replace('watch?v=', 'embed/'))}" title="${titleAttr}" allowfullscreen></iframe></div>`
      : imageUrl
        ? `<div class="event-media"><img src="${cacgEscapeAttr(imageUrl)}" alt="${titleAttr}"></div>`
        : '';
    return `
      <div class="event-card">
        <div class="event-date"><span class="day">${day}</span><span class="month">${month}</span></div>
        <div>
          <h3>${title}</h3>
          <p>${d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''}${time ? ' &middot; ' + time : ''}${location ? ' &middot; ' + location : ''}</p>
          <p>${description}</p>
          ${mediaHtml}
        </div>
      </div>
    `;
  }).join('');
}

function cacgRenderMinistries(ministries) {
  const grid = document.getElementById('ministriesGrid');
  if (!grid || !ministries || ministries.length === 0) return; // keep fallback content if nothing published yet

  grid.innerHTML = ministries.map((m) => {
    const categoryAttr = cacgEscapeAttr((m.category || '').toLowerCase());
    const category = cacgEscapeHtml(m.category || '');
    const name = cacgEscapeHtml(m.name || 'Untitled Ministry');
    const description = cacgEscapeHtml(m.description || '');
    return `
    <div class="ministry-card" data-category="${categoryAttr}">
      <div class="ministry-media">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/></svg>
      </div>
      <div class="ministry-body">
        <span class="tag">${category}</span>
        <h3>${name}</h3>
        <p>${description}</p>
      </div>
    </div>
  `;
  }).join('');
}

/** Renders the "Coming Up" sliding image gallery on the homepage.
 *  Data comes from spotlight_slides (managed from the admin dashboard's
 *  "Coming Up" tab — no code changes needed to add/reorder/remove a
 *  slide). If nothing is published yet, the static fallback slides
 *  already in the HTML stay untouched, same as every other section. */
function cacgRenderSpotlightSlides(slides) {
  const track = document.getElementById('spotlightTrack');
  const dots = document.getElementById('spotlightDots');
  if (!track || !slides || slides.length === 0) return;

  track.innerHTML = slides.map((s) => {
    const title = cacgEscapeHtml(s.title || '');
    const caption = cacgEscapeHtml(s.caption || '');
    const imgUrl = cacgSafeUrl(s.image_url);
    if (!imgUrl) return '';
    return `
    <div class="spotlight-slide">
      <img src="${cacgEscapeAttr(imgUrl)}" alt="${cacgEscapeAttr(title)}" loading="lazy">
      <div class="spotlight-caption">
        <h3>${title}</h3>
        <p>${caption}</p>
      </div>
    </div>
  `;
  }).join('');

  if (dots) {
    dots.innerHTML = slides.map((_, i) => `<button class="spotlight-dot${i === 0 ? ' is-active' : ''}" data-slide="${i}" aria-label="Go to slide ${i + 1}"></button>`).join('');
  }

  if (typeof window.cacgInitSpotlightSlider === 'function') {
    window.cacgInitSpotlightSlider();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const needsSermons = !!document.getElementById('sermonsGrid');
  const needsEvents = !!document.getElementById('eventsGrid');
  const needsMinistries = !!document.getElementById('ministriesGrid');
  const needsSpotlight = !!document.getElementById('spotlightTrack');

  const [settingsResult, sermonsResult, eventsResult, ministriesResult, spotlightResult] = await Promise.allSettled([
    cacgFetchTable('settings'),
    needsSermons ? cacgFetchTable('sermons') : Promise.resolve(null),
    needsEvents ? cacgFetchTable('events') : Promise.resolve(null),
    needsMinistries ? cacgFetchTable('ministries') : Promise.resolve(null),
    needsSpotlight ? cacgFetchTable('spotlight_slides') : Promise.resolve(null),
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

  try {
    if (needsSpotlight && spotlightResult.status === 'fulfilled') cacgRenderSpotlightSlides(spotlightResult.value);
  } catch (err) {
    console.warn('CACG content: Spotlight slides failed to render, keeping fallback content.', err);
  }
});
