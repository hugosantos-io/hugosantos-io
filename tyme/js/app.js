(function () {
  'use strict';

  const T = window.TymeTime;
  const CITIES = window.TYME_CITIES;
  const byId = Object.fromEntries(CITIES.map((city) => [city.id, city]));
  const STORAGE_KEY = 'tyme-state-v1';

  const state = {
    cityIds: [],
    homeId: '',
    date: null,
    hour12: false,
    showTz: true,
    markWeekends: false,
    showOverlap: true,
    theme: 'system',
    palette: 'atlas',
    bands: 'dusk',
    sort: 'manual',
    manualOrder: [],
    hover: null,
    selection: null
  };

  const els = {
    app: document.getElementById('app'),
    board: document.getElementById('board'),
    week: document.getElementById('week-strip'),
    dock: document.getElementById('selection-dock'),
    dockCopy: document.getElementById('selection-copy'),
    settingsOverlay: document.getElementById('settings-overlay'),
    cityQuery: document.getElementById('city-query'),
    searchResults: document.getElementById('search-results'),
    toast: document.getElementById('toast'),
    jumpNow: document.getElementById('jump-now')
  };

  let searchIndex = 0;
  let toastTimer = 0;
  let selectAnchor = null;

  function localTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  function cityByTz(tz) {
    return CITIES.find((city) => city.tz === tz);
  }

  function resolveLocalCity() {
    const tz = localTimeZone();
    const exact = cityByTz(tz);
    if (exact) return exact;
    const now = new Date();
    const localOffset = T.offsetMs(now, tz);
    const byOffset = CITIES.find((city) => T.offsetMs(now, city.tz) === localOffset);
    return byOffset || byId.utc;
  }

  function defaultCities() {
    const local = resolveLocalCity();
    const home = local.id;
    const pool = ['nyc', 'lon', 'tyo', 'sao', 'ber', 'dxb', 'syd'];
    const extras = pool.filter((id) => id !== home && byId[id]);
    return { homeId: home, cityIds: [home, ...extras.slice(0, 2)] };
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function todayInZone(tz) {
    const p = T.parts(new Date(), tz);
    return { year: p.year, month: p.month, day: p.day };
  }

  function homeCity() {
    return byId[state.homeId] || byId[state.cityIds[0]] || CITIES[0];
  }

  function homeTz() {
    return homeCity().tz;
  }

  function viewStart() {
    const d = state.date;
    return T.zonedLocalToUtc(d.year, d.month, d.day, 0, 0, homeTz());
  }

  function columnInstant(index) {
    return new Date(viewStart().getTime() + index * 3600000);
  }

  function applyChrome() {
    const root = document.documentElement;
    root.dataset.palette = state.palette;
    root.dataset.bands = state.bands;
    root.dataset.theme = state.theme;
    root.dataset.markWeekends = state.markWeekends ? 'true' : 'false';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const scheme = state.theme === 'system' ? (prefersDark ? 'dark' : 'light') : state.theme;
    root.dataset.scheme = scheme;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', scheme === 'dark' ? '#0b0f14' : '#e8edf5');
    document.querySelectorAll('[data-hour12]').forEach((btn) => {
      btn.classList.toggle('is-on', String(state.hour12) === btn.dataset.hour12);
    });
    document.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.classList.toggle('is-on', state.theme === btn.dataset.theme);
    });
    document.querySelectorAll('[data-palette]').forEach((btn) => {
      btn.classList.toggle('is-on', state.palette === btn.dataset.palette);
    });
    document.querySelectorAll('[data-bands]').forEach((btn) => {
      const on = state.bands === btn.dataset.bands;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('toggle-tz').checked = state.showTz;
    document.getElementById('toggle-weekends').checked = state.markWeekends;
    document.getElementById('toggle-overlap').checked = state.showOverlap;

    const schemeBtn = document.getElementById('toggle-scheme');
    if (schemeBtn) {
      const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' };
      const theme = themeLabels[state.theme] ? state.theme : 'system';
      schemeBtn.dataset.state = theme;
      schemeBtn.setAttribute('aria-label', `Theme: ${themeLabels[theme]}`);
      schemeBtn.title = themeLabels[theme];
    }
    const hourBtn = document.getElementById('toggle-hour');
    if (hourBtn) {
      const hourLabel = state.hour12 ? 'AM/PM' : '24h';
      hourBtn.dataset.state = state.hour12 ? '12' : '24';
      hourBtn.setAttribute('aria-label', state.hour12 ? '12-hour clock' : '24-hour clock');
      hourBtn.title = hourLabel;
      const caption = hourBtn.querySelector('.hour-caption');
      if (caption) caption.textContent = hourLabel;
    }
    const weekendsBtn = document.getElementById('toggle-weekends-btn');
    if (weekendsBtn) {
      weekendsBtn.dataset.state = state.markWeekends ? 'on' : 'off';
      weekendsBtn.setAttribute('aria-pressed', state.markWeekends ? 'true' : 'false');
      weekendsBtn.setAttribute('aria-label', state.markWeekends ? 'Weekends marked' : 'Mark weekends');
      weekendsBtn.title = 'Weekends';
    }
    const sortBtn = document.getElementById('toggle-sort');
    if (sortBtn) {
      const sortLabels = {
        manual: 'Manual order',
        largest: 'Largest offset first',
        smallest: 'Smallest offset first'
      };
      const sort = sortLabels[state.sort] ? state.sort : 'manual';
      sortBtn.dataset.state = sort;
      sortBtn.setAttribute('aria-label', `Sort: ${sortLabels[sort]}`);
      sortBtn.title = sortLabels[sort];
    }
  }

  function persist() {
    const payload = {
      version: 5,
      cityIds: state.cityIds,
      homeId: state.homeId,
      hour12: state.hour12,
      showTz: state.showTz,
      markWeekends: state.markWeekends,
      showOverlap: state.showOverlap,
      theme: state.theme,
      palette: state.palette,
      bands: state.bands,
      sort: state.sort,
      manualOrder: state.manualOrder,
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* quota or private mode */
    }
    writeHash();
  }

  function writeHash() {
    const params = new URLSearchParams();
    params.set('z', state.cityIds.join(','));
    params.set('h', state.homeId);
    if (state.hour12) params.set('fmt', '12');
    if (state.selection) params.set('s', `${state.selection.start}-${state.selection.end}`);
    history.replaceState(null, '', `#${params.toString()}`);
  }

  function loadState() {
    const defaults = defaultCities();
    const stored = readStorage() || {};
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const hashCities = (hash.get('z') || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => byId[id]);
    const storedCities = Array.isArray(stored.cityIds)
      ? stored.cityIds.filter((id) => byId[id])
      : [];

    if (hashCities.length) state.cityIds = hashCities;
    else if (storedCities.length) state.cityIds = storedCities;
    else state.cityIds = defaults.cityIds;

    const hashHome = hash.get('h');
    if (hashHome && byId[hashHome] && state.cityIds.includes(hashHome)) state.homeId = hashHome;
    else if (stored.homeId && byId[stored.homeId] && state.cityIds.includes(stored.homeId)) state.homeId = stored.homeId;
    else if (state.cityIds.includes(defaults.homeId)) state.homeId = defaults.homeId;
    else state.homeId = state.cityIds[0];

    // Always open on the live home-zone calendar day; do not restore a navigated date.
    state.date = todayInZone(byId[state.homeId].tz);
    state.hour12 = hash.get('fmt') === '12' || stored.hour12 === true;
    state.showTz = stored.showTz === true;
    // v5: weekend tint off by default so every weekday shares the band palette
    if (!stored.version || stored.version < 5) state.markWeekends = false;
    else state.markWeekends = stored.markWeekends === true;
    state.showOverlap = stored.showOverlap !== false;
    state.theme = stored.theme || 'system';
    // v3 redesign: cool neutrals + blue default; refresh legacy warm palettes once
    if (!stored.version || stored.version < 3) state.palette = 'atlas';
    else state.palette = stored.palette || 'atlas';
    const allowedBands = ['dusk', 'mist', 'urban'];
    state.bands = allowedBands.includes(stored.bands) ? stored.bands : 'dusk';
    const sortModes = ['manual', 'largest', 'smallest'];
    state.sort = sortModes.includes(stored.sort) ? stored.sort : 'manual';
    const storedManual = Array.isArray(stored.manualOrder)
      ? stored.manualOrder.filter((id) => byId[id] && state.cityIds.includes(id))
      : [];
    state.manualOrder = storedManual.length ? storedManual : state.cityIds.slice();
    state.cityIds.forEach((id) => {
      if (!state.manualOrder.includes(id)) state.manualOrder.push(id);
    });
    // Fresh visits start without a selection so the live-hour guide is visible
    state.selection = null;
    if (state.sort !== 'manual') state.cityIds = sortedCityIds(state.sort);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 1800);
  }

  function renderWeek() {
    const home = homeTz();
    const selected = state.date;
    const selectedUtc = T.zonedLocalToUtc(selected.year, selected.month, selected.day, 12, 0, home);
    const start = T.addDays(selectedUtc, -1);
    const today = todayInZone(home);
    const chips = [];
    for (let i = 0; i < 3; i += 1) {
      const instant = T.addDays(start, i);
      const p = T.parts(instant, home);
      const iso = T.isoDate(p);
      const active = p.year === selected.year && p.month === selected.month && p.day === selected.day;
      const isToday = p.year === today.year && p.month === today.month && p.day === today.day;
      chips.push(`
        <button class="day-chip${active ? ' is-active' : ''}${isToday ? ' is-today' : ''}${T.isWeekend(p.weekday) ? ' weekend' : ''}" type="button" data-date="${iso}">
          <span class="dow">${p.weekday}</span>
          <span class="dom">${p.day}</span>
        </button>
      `);
    }
    els.week.innerHTML = chips.join('');
  }

  function placeLabel(city) {
    const region = city.region && city.region !== city.name ? city.region : '';
    return [city.country, region].filter(Boolean).join(', ');
  }

  function overlapAt(index) {
    if (!state.showOverlap) return false;
    return state.cityIds.every((id) => {
      const hour = T.parts(columnInstant(index), byId[id].tz).hour;
      return T.inBusinessHours(hour);
    });
  }

  function selectedRange() {
    if (!state.selection) return null;
    const a = Math.min(state.selection.start, state.selection.end);
    const b = Math.max(state.selection.start, state.selection.end);
    return { start: a, end: b };
  }

  function renderBoard() {
    if (!state.cityIds.length) {
      els.board.innerHTML = `
        <div class="empty">
          <h2>Add a city to begin</h2>
          <p>Compare time zones on one grid, then tap hours to pick a meeting window.</p>
          <button class="text-btn" id="empty-add" type="button">Add a city</button>
        </div>`;
      const add = document.getElementById('empty-add');
      if (add) add.addEventListener('click', openSearch);
      els.dock.hidden = true;
      return;
    }

    const home = homeCity();
    const now = new Date();
    const homeOffset = T.offsetMs(viewStart(), home.tz);
    const range = selectedRange();
    const rows = [];

    state.cityIds.forEach((id) => {
      const city = byId[id];
      const live = T.parts(now, city.tz);
      const shown = state.hover == null ? live : T.parts(columnInstant(state.hover), city.tz);
      const offset = T.offsetHours(homeOffset, T.offsetMs(viewStart(), city.tz));
      const isHome = id === state.homeId;
      let previousDay = null;

      const hours = Array.from({ length: 24 }, (_, index) => {
        const instant = columnInstant(index);
        const p = T.parts(instant, city.tz);
        const label = T.formatHourLabel(p.hour, state.hour12);
        const band = T.hourBand(p.hour);
        const weekend = state.markWeekends && T.isWeekend(p.weekday);
        const dateChange = !previousDay || !T.sameCalendarDay(previousDay, p);
        previousDay = p;
        const chip = dateChange ? T.formatDateChip(p) : null;
        const selected = range && index >= range.start && index <= range.end;
        const hover = state.hover === index;
        const overlap = overlapAt(index);
        const classes = [
          'hour',
          band,
          weekend ? 'weekend' : '',
          dateChange ? 'is-day-start' : '',
          selected ? 'is-selected' : '',
          hover ? 'is-hover' : '',
          overlap ? 'is-overlap' : ''
        ].filter(Boolean).join(' ');
        const tz = state.showTz ? `<span class="tz">${p.tzName}</span>` : '';
        const date = chip
          ? `<span class="date-chip"><span class="date-chip-dow">${chip.weekday}</span><span class="date-chip-num">${chip.day}</span></span>`
          : '';
        return `
          <button class="${classes}" type="button" role="gridcell" data-hour="${index}" aria-label="${city.name} ${label.main}${label.sub}">
            ${date}
            <span class="h">${label.main}</span>
            ${label.sub ? `<span class="sub">${label.sub}</span>` : ''}
            ${tz}
          </button>
        `;
      }).join('');

      rows.push(`
        <div class="city-row" role="row" data-city="${id}">
          <div class="city-card${isHome ? ' is-home' : ''}" role="rowheader" data-drag="${id}" title="Drag to reorder">
            <div class="city-actions">
              <button class="mini mini-remove" type="button" data-remove="${id}" aria-label="Remove city" title="Remove">
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              </button>
              <button class="mini mini-home${isHome ? ' is-on' : ''}" type="button" data-home="${id}" aria-label="${isHome ? 'Home city' : 'Set as home'}" title="${isHome ? 'Home' : 'Set as home'}" ${isHome ? 'aria-pressed="true"' : ''}>
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path class="home-glyph" d="M4 11l8-7 8 7v9H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <div class="city-copy">
              ${isHome
                ? `<button class="offset-home" type="button" data-home="${id}" aria-label="Home city" title="Home" aria-pressed="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path class="home-glyph" d="M4 11l8-7 8 7v9H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                  </button>`
                : `<span class="offset">${T.formatOffset(offset)}</span>`}
              <div class="city-id">
                <div class="city-title">
                  <h3 class="city-name">${city.name}</h3>
                  ${live.tzName ? `<span class="tz-pill">${live.tzName}</span>` : ''}
                </div>
                <span class="meta place">${placeLabel(city)}</span>
              </div>
              <div class="city-when">
                <span class="live${state.hover != null ? ' is-hover' : ''}">${T.formatClock(shown.hour, shown.minute, state.hour12)}</span>
                <span class="date-line">${T.formatDateShort(shown)}</span>
              </div>
            </div>
          </div>
          ${hours}
        </div>
      `);
    });

    const hoverBox = `<div class="hover-box" hidden style="--hover-col:0; --hover-span:1"></div>`;
    const selectBox = `<div class="select-box" hidden style="--select-col:0; --select-span:1">
      <button type="button" class="resize-handle is-start" data-resize="start" aria-label="Resize selection start"></button>
      <button type="button" class="resize-handle is-end" data-resize="end" aria-label="Resize selection end"></button>
    </div>`;
    const scrollX = els.board.scrollLeft;
    const scrollY = els.board.scrollTop;
    els.board.innerHTML = `<div class="board-inner">${selectBox}${hoverBox}${rows.join('')}</div>`;
    els.board.scrollLeft = scrollX;
    els.board.scrollTop = scrollY;
    paintSelectBox();
    paintHoverBox();
    renderDock();
  }

  function renderDock() {
    const range = selectedRange();
    if (!range) {
      els.dock.hidden = true;
      return;
    }
    const start = T.parts(columnInstant(range.start), homeTz());
    const endInstant = new Date(columnInstant(range.end).getTime() + 3600000);
    const end = T.parts(endInstant, homeTz());
    const home = homeCity();
    const rows = state.cityIds.map((id) => {
      const city = byId[id];
      const a = T.parts(columnInstant(range.start), city.tz);
      const b = T.parts(endInstant, city.tz);
      const span = T.formatDockRange(a.hour, a.minute, b.hour, b.minute);
      return `<li><span class="dock-range">${span}</span><span class="dock-city">${city.name}</span></li>`;
    }).join('');
    els.dockCopy.innerHTML = `
      <strong>${range.end - range.start + 1}h window</strong>
      <p class="dock-meta">${T.formatDateShort(start)} · ${T.pad(start.hour)}:${T.pad(start.minute)}–${T.pad(end.hour)}:${T.pad(end.minute)} ${home.name}</p>
      <ul class="dock-cities">${rows}</ul>
    `;
    els.dock.hidden = false;
  }

  function render() {
    applyChrome();
    renderWeek();
    renderBoard();
    persist();
  }

  function setDate(next) {
    state.date = next;
    state.hover = null;
    render();
  }

  function shiftDate(days) {
    const noon = T.zonedLocalToUtc(state.date.year, state.date.month, state.date.day, 12, 0, homeTz());
    const p = T.parts(T.addDays(noon, days), homeTz());
    setDate({ year: p.year, month: p.month, day: p.day });
  }

  function scrollNowIntoView(smooth) {
    const hour = T.parts(new Date(), homeTz()).hour;
    const nowCell = els.board.querySelector(`[data-hour="${hour}"]`);
    if (!nowCell) return;
    const narrow = window.matchMedia('(max-width: 720px)').matches;
    if (!narrow) {
      nowCell.scrollIntoView({
        inline: 'center',
        block: 'nearest',
        behavior: smooth ? 'smooth' : 'auto'
      });
      return;
    }
    // On phones, sit "now" just after the sticky city column
    const label = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label')) || 152;
    const boardRect = els.board.getBoundingClientRect();
    const cellRect = nowCell.getBoundingClientRect();
    const delta = cellRect.left - (boardRect.left + label + 8);
    const target = Math.max(0, els.board.scrollLeft + delta);
    els.board.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
  }

  function jumpToNow() {
    state.date = todayInZone(homeTz());
    state.hover = null;
    render();
    requestAnimationFrame(() => scrollNowIntoView(true));
  }

  function captureRowRects() {
    const map = new Map();
    els.board.querySelectorAll('.city-row').forEach((row) => {
      map.set(row.dataset.city, row.getBoundingClientRect());
    });
    return map;
  }

  function settleRowAnimations() {
    els.board.querySelectorAll('.city-row').forEach((row) => {
      row.getAnimations().forEach((animation) => animation.finish());
      row.style.transform = '';
    });
  }

  function animateRowReorder(before, skipId) {
    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.board.querySelectorAll('.city-row').forEach((row) => {
      if (skipId && row.dataset.city === skipId) return;
      const prev = before.get(row.dataset.city);
      if (!prev) return;
      const next = row.getBoundingClientRect();
      const dy = prev.top - next.top;
      if (Math.abs(dy) < 1) return;
      row.classList.add('is-moved');
      clearTimeout(row._movedTimer);
      row._movedTimer = setTimeout(() => row.classList.remove('is-moved'), 320);
      if (prefersReduce) return;
      row.getAnimations().forEach((animation) => animation.cancel());
      row.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    });
  }

  function applyDomOrder(ids, animate, skipId) {
    const inner = els.board.querySelector('.board-inner');
    if (!inner) {
      state.cityIds = ids.slice();
      renderBoard();
      return;
    }
    if (animate) settleRowAnimations();
    const before = animate ? captureRowRects() : null;
    ids.forEach((id) => {
      const row = inner.querySelector(`.city-row[data-city="${id}"]`);
      if (row) inner.appendChild(row);
    });
    // Keep overlays above rows so absolute boxes stay stable
    ['.select-box', '.hover-box'].forEach((sel) => {
      const el = inner.querySelector(sel);
      if (el) inner.appendChild(el);
    });
    state.cityIds = ids.slice();
    if (before) {
      requestAnimationFrame(() => animateRowReorder(before, skipId));
    }
  }

  function reorderCities(nextIds, animate) {
    if (animate) settleRowAnimations();
    const before = animate ? captureRowRects() : null;
    state.cityIds = nextIds;
    renderBoard();
    persist();
    if (before) requestAnimationFrame(() => animateRowReorder(before));
  }

  function moveCityToIndex(id, toIndex) {
    const from = state.cityIds.indexOf(id);
    if (from < 0 || toIndex < 0 || toIndex >= state.cityIds.length || from === toIndex) return;
    const copy = state.cityIds.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(toIndex, 0, item);
    reorderCities(copy, true);
  }

  function cityOffsetHours(id) {
    const city = byId[id];
    if (!city) return 0;
    const homeOffset = T.offsetMs(viewStart(), homeTz());
    return T.offsetHours(homeOffset, T.offsetMs(viewStart(), city.tz));
  }

  function sortedCityIds(mode) {
    const base = [];
    state.manualOrder.forEach((id) => {
      if (state.cityIds.includes(id) && byId[id] && !base.includes(id)) base.push(id);
    });
    state.cityIds.forEach((id) => {
      if (!base.includes(id)) base.push(id);
    });
    if (mode !== 'largest' && mode !== 'smallest') return base;
    const sign = mode === 'smallest' ? -1 : 1;
    return base.slice().sort((a, b) => {
      const delta = cityOffsetHours(a) - cityOffsetHours(b);
      if (delta === 0) return base.indexOf(a) - base.indexOf(b);
      return delta * sign;
    });
  }

  function addCity(id) {
    if (state.cityIds.includes(id)) {
      toast('City already on the board');
      return;
    }
    state.cityIds.push(id);
    state.manualOrder.push(id);
    if (!state.homeId) state.homeId = id;
    if (state.sort !== 'manual') state.cityIds = sortedCityIds(state.sort);
    closeSearch();
    render();
  }

  function removeCity(id) {
    state.cityIds = state.cityIds.filter((item) => item !== id);
    state.manualOrder = state.manualOrder.filter((item) => item !== id);
    if (state.homeId === id) state.homeId = state.cityIds[0] || '';
    if (state.sort !== 'manual') state.cityIds = sortedCityIds(state.sort);
    render();
  }

  function setHome(id) {
    if (!byId[id]) return;
    state.homeId = id;
    if (!state.cityIds.includes(id)) {
      state.cityIds.unshift(id);
      state.manualOrder.push(id);
    }
    if (state.sort === 'manual') {
      state.cityIds = [id, ...state.cityIds.filter((cityId) => cityId !== id)];
      state.manualOrder = state.cityIds.slice();
    } else {
      state.cityIds = sortedCityIds(state.sort);
    }
    state.date = todayInZone(byId[id].tz);
    state.hover = null;
    toast(`${byId[id].name} is home`);
    render();
  }

  function setSelection(start, end) {
    state.selection = {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  }

  function currentHourCol() {
    return T.parts(new Date(), homeTz()).hour;
  }

  function clearSelection() {
    if (!state.selection) return;
    state.selection = null;
    selectAnchor = null;
    paintSelection();
    persist();
  }

  function paintSelectBox() {
    const box = els.board.querySelector('.select-box');
    if (!box) return;
    if (rowDrag) {
      box.hidden = true;
      return;
    }
    const range = selectedRange();
    if (range) {
      box.hidden = false;
      box.classList.remove('is-now');
      box.style.setProperty('--select-col', String(range.start));
      box.style.setProperty('--select-span', String(range.end - range.start + 1));
      return;
    }
    // No selection: park a light guide on the live hour while viewing today
    const today = todayInZone(homeTz());
    const viewingToday = today.year === state.date.year
      && today.month === state.date.month
      && today.day === state.date.day;
    if (!viewingToday || state.hover != null) {
      box.hidden = true;
      box.classList.remove('is-now');
      return;
    }
    box.hidden = false;
    box.classList.add('is-now');
    box.style.setProperty('--select-col', String(currentHourCol()));
    box.style.setProperty('--select-span', '1');
  }

  function paintHoverBox() {
    const box = els.board.querySelector('.hover-box');
    if (!box) return;
    if (rowDrag || dragging || resizing || state.hover == null) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.style.setProperty('--hover-col', String(state.hover));
    box.style.setProperty('--hover-span', '1');
  }

  function paintSelection() {
    const range = selectedRange();
    els.board.querySelectorAll('.hour').forEach((cell) => {
      const index = Number(cell.dataset.hour);
      const selected = range && index >= range.start && index <= range.end;
      const hover = state.hover === index;
      cell.classList.toggle('is-selected', Boolean(selected));
      cell.classList.toggle('is-hover', hover);
    });
    state.cityIds.forEach((id) => {
      const row = els.board.querySelector(`.city-row[data-city="${id}"]`);
      if (!row) return;
      const city = byId[id];
      const live = row.querySelector('.live');
      const dateLine = row.querySelector('.date-line');
      if (!live || !city) return;
      const shown = state.hover == null
        ? T.parts(new Date(), city.tz)
        : T.parts(columnInstant(state.hover), city.tz);
      live.textContent = T.formatClock(shown.hour, shown.minute, state.hour12);
      live.classList.toggle('is-hover', state.hover != null);
      if (dateLine) dateLine.textContent = T.formatDateShort(shown);
      const pill = row.querySelector('.tz-pill');
      if (pill && shown.tzName) pill.textContent = shown.tzName;
    });
    paintSelectBox();
    paintHoverBox();
    renderDock();
  }

  function pickHour(index, additive) {
    const range = selectedRange();
    if (additive && selectAnchor != null) {
      setSelection(selectAnchor, index);
    } else if (range && range.start === index && range.end === index) {
      state.selection = null;
      selectAnchor = null;
    } else {
      setSelection(index, index);
      selectAnchor = index;
    }
    state.hover = index;
    paintSelection();
    if (!dragging) persist();
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    try {
      if (activePointerId != null) els.board.releasePointerCapture(activePointerId);
    } catch (err) {
      /* already released */
    }
    activePointerId = null;
    persist();
  }

  function selectionText() {
    const range = selectedRange();
    if (!range) return '';
    const endInstant = new Date(columnInstant(range.end).getTime() + 3600000);
    const lines = state.cityIds.map((id) => {
      const city = byId[id];
      const a = T.parts(columnInstant(range.start), city.tz);
      const b = T.parts(endInstant, city.tz);
      return `${T.formatDockRange(a.hour, a.minute, b.hour, b.minute)}  ${city.name}`;
    });
    return `${range.end - range.start + 1}h window\n${lines.join('\n')}`;
  }

  function copyText(value, ok) {
    navigator.clipboard.writeText(value).then(() => toast(ok)).catch(() => toast('Copy failed'));
  }

  function fold(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[_/,.-]+/g, ' ');
  }

  function scoreCity(city, query) {
    const hay = fold(`${city.name} ${city.country} ${city.region} ${city.tz} ${city.aliases} ${city.id}`);
    const name = fold(city.name);
    if (hay.startsWith(query) || name.startsWith(query)) return 0;
    if (name.includes(query) || hay.includes(` ${query}`)) return 1;
    if (hay.includes(query)) return 2;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((token) => hay.includes(token))) return 3;
    return -1;
  }

  function searchCities(query) {
    const q = fold(query).trim();
    const pool = q
      ? CITIES.map((city) => ({ city, score: scoreCity(city, q) })).filter((row) => row.score >= 0)
        .sort((a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name))
        .map((row) => row.city)
      : CITIES.filter((city) => !state.cityIds.includes(city.id)).slice(0, 12);
    return pool.slice(0, 20);
  }

  function renderSearch(query) {
    const hits = searchCities(query);
    if (!hits.length) {
      const q = String(query || '').trim();
      els.searchResults.hidden = !q;
      els.searchResults.innerHTML = q
        ? `<div class="search-empty" role="status">
            <p class="search-empty-title">No matching city</p>
            <p class="search-empty-hint">Try another spelling, country, or timezone.</p>
          </div>`
        : '';
      return;
    }
    els.searchResults.hidden = false;
    searchIndex = Math.min(Math.max(searchIndex, 0), hits.length - 1);
    els.searchResults.innerHTML = hits.map((city, index) => `
      <button class="city-hit${index === searchIndex ? ' is-active' : ''}" type="button" data-add="${city.id}">
        <strong>${city.name}</strong>
        <span class="where">${[city.region, city.country].filter(Boolean).join(', ')}</span>
        <span class="zone">${city.tz}</span>
      </button>
    `).join('');
  }

  function openSearch() {
    searchIndex = 0;
    renderSearch(els.cityQuery.value);
    els.cityQuery.focus();
  }

  function closeSearch() {
    els.cityQuery.value = '';
    els.searchResults.innerHTML = '';
    els.searchResults.hidden = true;
    if (document.activeElement === els.cityQuery) els.cityQuery.blur();
  }

  function openSettings() {
    els.settingsOverlay.hidden = false;
    document.body.classList.add('is-overlay-open');
  }

  function closeSettings() {
    els.settingsOverlay.hidden = true;
    document.body.classList.remove('is-overlay-open');
  }

  let dragging = false;
  let resizing = null;
  let activePointerId = null;
  let rowDrag = null;
  let pendingTap = null;
  const TAP_SLOP = 12;

  function isTouchPointer(event) {
    return event.pointerType === 'touch';
  }

  function clearPendingTap() {
    pendingTap = null;
  }

  function startHourDrag(event, hourEl) {
    event.preventDefault();
    dragging = true;
    activePointerId = event.pointerId;
    try {
      els.board.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture unsupported */
    }
    pickHour(Number(hourEl.dataset.hour), event.shiftKey);
  }

  function startResize(event, edge) {
    const range = selectedRange();
    if (!range) return;
    event.preventDefault();
    event.stopPropagation();
    resizing = {
      edge,
      anchor: edge === 'start' ? range.end : range.start,
      pointerId: event.pointerId
    };
    selectAnchor = resizing.anchor;
    document.body.classList.add('is-resizing');
    try {
      els.board.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture unsupported */
    }
  }

  function updateResize(event) {
    if (!resizing) return;
    const index = hourFromPoint(event.clientX, event.clientY);
    if (index == null) return;
    const nextStart = resizing.edge === 'start' ? index : resizing.anchor;
    const nextEnd = resizing.edge === 'end' ? index : resizing.anchor;
    const range = selectedRange();
    if (range && range.start === Math.min(nextStart, nextEnd) && range.end === Math.max(nextStart, nextEnd)) {
      return;
    }
    setSelection(nextStart, nextEnd);
    state.hover = index;
    paintSelection();
  }

  function endResize() {
    if (!resizing) return;
    resizing = null;
    document.body.classList.remove('is-resizing');
    persist();
  }

  function onBoardClick(event) {
    const action = event.target.closest('[data-home], [data-remove]');
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.dataset.home) setHome(action.dataset.home);
    else if (action.dataset.remove) removeCity(action.dataset.remove);
  }

  function hourIndexFromX(clientX) {
    const inner = els.board.querySelector('.board-inner');
    if (!inner) return null;
    const label = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label')) || 184;
    const boardRect = els.board.getBoundingClientRect();
    const x = clientX - boardRect.left + els.board.scrollLeft;
    if (x < label) return 0;
    const hoursWidth = Math.max(inner.scrollWidth, els.board.clientWidth) - label;
    if (hoursWidth <= 0) return 0;
    const col = Math.floor(((x - label) / hoursWidth) * 24);
    return Math.max(0, Math.min(23, col));
  }

  function hourFromPoint(clientX, clientY) {
    if (resizing) return hourIndexFromX(clientX);
    const el = document.elementFromPoint(clientX, clientY);
    const hour = el && el.closest ? el.closest('.hour') : null;
    return hour ? Number(hour.dataset.hour) : null;
  }

  function rowIndexFromPoint(clientY) {
    const rows = [...els.board.querySelectorAll('.city-row')];
    if (!rows.length) return 0;
    // Use layout offsets (ignore FLIP transforms) so hit-testing stays stable mid-animation
    const y = clientY - els.board.getBoundingClientRect().top + els.board.scrollTop;
    for (let i = 0; i < rows.length; i += 1) {
      const top = rows[i].offsetTop;
      const mid = top + rows[i].offsetHeight / 2;
      if (y < mid) return i;
    }
    return rows.length - 1;
  }

  function clearRowDropMarks() {
    els.board.querySelectorAll('.city-row.is-drop-before, .city-row.is-drop-after')
      .forEach((row) => row.classList.remove('is-drop-before', 'is-drop-after'));
  }

  function startRowDrag(event, id) {
    event.preventDefault();
    event.stopPropagation();
    settleRowAnimations();
    rowDrag = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      origin: state.cityIds.indexOf(id),
      to: state.cityIds.indexOf(id)
    };
    document.body.classList.add('is-row-dragging');
    const row = els.board.querySelector(`.city-row[data-city="${id}"]`);
    if (row) row.classList.add('is-dragging');
    const hover = els.board.querySelector('.hover-box');
    if (hover) hover.hidden = true;
    const select = els.board.querySelector('.select-box');
    if (select) select.hidden = true;
    try {
      els.board.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture unsupported */
    }
  }

  function updateRowDrag(event) {
    if (!rowDrag) return;
    const to = rowIndexFromPoint(event.clientY);
    if (to === rowDrag.to) return;
    const ids = state.cityIds.slice();
    const from = ids.indexOf(rowDrag.id);
    if (from < 0 || from === to) {
      rowDrag.to = to;
      return;
    }
    rowDrag.to = to;
    const [item] = ids.splice(from, 1);
    ids.splice(to, 0, item);
    applyDomOrder(ids, true, rowDrag.id);
    const dragRow = els.board.querySelector(`.city-row[data-city="${rowDrag.id}"]`);
    if (dragRow) dragRow.classList.add('is-dragging');
  }

  function endRowDrag() {
    if (!rowDrag) return;
    const moved = rowDrag.to !== rowDrag.origin;
    rowDrag = null;
    document.body.classList.remove('is-row-dragging');
    clearRowDropMarks();
    els.board.querySelectorAll('.city-row.is-dragging')
      .forEach((row) => row.classList.remove('is-dragging'));
    paintSelectBox();
    paintHoverBox();
    if (moved) {
      state.sort = 'manual';
      state.manualOrder = state.cityIds.slice();
      applyChrome();
      persist();
    }
  }

  function bind() {
    document.getElementById('prev-day').addEventListener('click', () => shiftDate(-1));
    document.getElementById('next-day').addEventListener('click', () => shiftDate(1));
    els.jumpNow.addEventListener('click', jumpToNow);
    document.getElementById('open-settings').addEventListener('click', openSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);
    document.getElementById('copy-times').addEventListener('click', () => copyText(selectionText(), 'Times copied'));
    document.getElementById('copy-link').addEventListener('click', () => copyText(location.href, 'Link copied'));
    document.getElementById('clear-selection').addEventListener('click', () => {
      clearSelection();
    });

    els.week.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-date]');
      if (!chip) return;
      const parsed = T.parseIsoDate(chip.dataset.date);
      if (parsed) setDate(parsed);
    });

    els.board.addEventListener('pointerdown', (event) => {
      const resizeHandle = event.target.closest('[data-resize]');
      if (resizeHandle) {
        startResize(event, resizeHandle.dataset.resize);
        return;
      }
      const action = event.target.closest('[data-home], [data-remove]');
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        onBoardClick(event);
        return;
      }
      const dragTarget = event.target.closest('[data-drag]');
      if (dragTarget && !event.target.closest('.city-actions')) {
        startRowDrag(event, dragTarget.dataset.drag);
        return;
      }
      if (event.target.closest('.city-card')) return;
      const hour = event.target.closest('.hour');
      if (!hour) return;
      // Touch: defer selection so horizontal/vertical pans can scroll the board
      if (isTouchPointer(event)) {
        pendingTap = {
          pointerId: event.pointerId,
          hour: Number(hour.dataset.hour),
          x: event.clientX,
          y: event.clientY,
          shiftKey: event.shiftKey
        };
        return;
      }
      startHourDrag(event, hour);
    });
    els.board.addEventListener('click', (event) => {
      if (event.target.closest('[data-home], [data-remove], [data-resize]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    els.board.addEventListener('pointermove', (event) => {
      if (pendingTap && event.pointerId === pendingTap.pointerId) {
        const dx = event.clientX - pendingTap.x;
        const dy = event.clientY - pendingTap.y;
        if (Math.hypot(dx, dy) > TAP_SLOP) clearPendingTap();
        return;
      }
      if (rowDrag) {
        updateRowDrag(event);
        return;
      }
      if (resizing) {
        updateResize(event);
        return;
      }
      if (!dragging) {
        if (isTouchPointer(event)) return;
        const index = hourFromPoint(event.clientX, event.clientY);
        if (index == null) return;
        if (state.hover !== index) {
          state.hover = index;
          paintSelection();
        }
        return;
      }
      const index = hourFromPoint(event.clientX, event.clientY);
      if (index == null || selectAnchor == null) return;
      if (state.hover === index && selectedRange()
        && Math.min(selectAnchor, index) === selectedRange().start
        && Math.max(selectAnchor, index) === selectedRange().end) {
        return;
      }
      setSelection(selectAnchor, index);
      state.hover = index;
      paintSelection();
    });
    els.board.addEventListener('pointerup', (event) => {
      if (pendingTap && event.pointerId === pendingTap.pointerId) {
        const tap = pendingTap;
        clearPendingTap();
        pickHour(tap.hour, tap.shiftKey);
        return;
      }
      if (rowDrag) {
        endRowDrag();
        return;
      }
      if (resizing) {
        endResize();
        return;
      }
      endDrag();
    });
    els.board.addEventListener('pointercancel', () => {
      clearPendingTap();
      if (rowDrag) {
        endRowDrag();
        return;
      }
      if (resizing) {
        endResize();
        return;
      }
      endDrag();
    });
    els.board.addEventListener('lostpointercapture', () => {
      clearPendingTap();
      if (rowDrag) {
        endRowDrag();
        return;
      }
      if (resizing) {
        endResize();
        return;
      }
      if (dragging) endDrag();
    });
    els.board.addEventListener('mouseleave', () => {
      if (!dragging && !resizing && !rowDrag && state.hover != null) {
        state.hover = null;
        paintSelection();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!state.selection || dragging || resizing || rowDrag) return;
      if (event.target.closest('#board, .dock, .overlay, .toast, .command-bar, .command-search, .top-actions')) return;
      clearSelection();
    });

    window.addEventListener('pagehide', persist);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });

    els.searchResults.addEventListener('pointerdown', (event) => {
      const hit = event.target.closest('[data-add]');
      if (!hit) return;
      event.preventDefault();
      addCity(hit.dataset.add);
    });

    els.cityQuery.addEventListener('focus', () => {
      searchIndex = 0;
      renderSearch(els.cityQuery.value);
    });

    els.cityQuery.addEventListener('input', () => {
      searchIndex = 0;
      renderSearch(els.cityQuery.value);
    });

    // Keep the dialog open when the OS search keyboard fires Enter/clear
    els.cityQuery.addEventListener('search', (event) => {
      event.preventDefault();
      searchIndex = 0;
      renderSearch(els.cityQuery.value);
      els.cityQuery.focus();
    });

    els.cityQuery.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') event.preventDefault();
    });

    els.cityQuery.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (document.activeElement === els.cityQuery) return;
        els.searchResults.hidden = true;
      }, 0);
    });

    els.settingsOverlay.addEventListener('click', (event) => {
      if (event.target === els.settingsOverlay) closeSettings();
    });

    document.querySelectorAll('[data-hour12]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.hour12 = btn.dataset.hour12 === 'true';
        render();
      });
    });
    document.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.theme = btn.dataset.theme;
        render();
      });
    });
    document.querySelectorAll('[data-palette]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.palette = btn.dataset.palette;
        render();
      });
    });
    document.querySelectorAll('[data-bands]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.bands = btn.dataset.bands;
        applyChrome();
        persist();
      });
    });
    document.getElementById('toggle-tz').addEventListener('change', (event) => {
      state.showTz = event.target.checked;
      render();
    });
    document.getElementById('toggle-weekends').addEventListener('change', (event) => {
      state.markWeekends = event.target.checked;
      render();
    });
    document.getElementById('toggle-overlap').addEventListener('change', (event) => {
      state.showOverlap = event.target.checked;
      render();
    });
    document.getElementById('toggle-scheme').addEventListener('click', () => {
      const order = ['light', 'dark', 'system'];
      const index = order.indexOf(state.theme);
      state.theme = order[(index + 1) % order.length];
      render();
    });
    document.getElementById('toggle-hour').addEventListener('click', () => {
      state.hour12 = !state.hour12;
      render();
    });
    document.getElementById('toggle-weekends-btn').addEventListener('click', () => {
      state.markWeekends = !state.markWeekends;
      render();
    });
    document.getElementById('toggle-sort').addEventListener('click', () => {
      const order = ['manual', 'largest', 'smallest'];
      const index = Math.max(0, order.indexOf(state.sort));
      state.sort = order[(index + 1) % order.length];
      const next = sortedCityIds(state.sort);
      if (next.join(',') !== state.cityIds.join(',')) reorderCities(next, true);
      else persist();
      applyChrome();
    });

    document.addEventListener('keydown', (event) => {
      const searchActive = document.activeElement === els.cityQuery;
      if (event.key === 'Escape') {
        if (searchActive) closeSearch();
        closeSettings();
        return;
      }
      if ((event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey)))
        && !searchActive
        && els.settingsOverlay.hidden) {
        event.preventDefault();
        openSearch();
        return;
      }
      if (searchActive) {
        const hits = [...els.searchResults.querySelectorAll('[data-add]')];
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          searchIndex = Math.min(searchIndex + 1, Math.max(hits.length - 1, 0));
          renderSearch(els.cityQuery.value);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          searchIndex = Math.max(searchIndex - 1, 0);
          renderSearch(els.cityQuery.value);
        }
        if (event.key === 'Enter' && hits[searchIndex]) {
          event.preventDefault();
          addCity(hits[searchIndex].dataset.add);
        }
        return;
      }
      if (event.key === 'ArrowRight') {
        state.hover = Math.min(23, (state.hover ?? T.parts(new Date(), homeTz()).hour) + 1);
        paintSelection();
      }
      if (event.key === 'ArrowLeft') {
        state.hover = Math.max(0, (state.hover ?? T.parts(new Date(), homeTz()).hour) - 1);
        paintSelection();
      }
      if (event.key === 'Enter' && state.hover != null) pickHour(state.hover, event.shiftKey);
      if (event.key === 'n' && !event.metaKey && !event.ctrlKey) jumpToNow();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyChrome);
    setInterval(() => {
      if (document.activeElement === els.cityQuery) return;
      renderBoard();
    }, 30000);
  }

  loadState();
  bind();
  render();
  requestAnimationFrame(() => {
    const today = todayInZone(homeTz());
    const sameDay = today.year === state.date.year && today.month === state.date.month && today.day === state.date.day;
    if (!sameDay) return;
    scrollNowIntoView(false);
  });
})();
