/* ================================================================
   Tab Harbor — Dashboard App (Pure Extension Edition)

   This file is the brain of the dashboard. Now that the dashboard
   IS the extension page (not inside an iframe), it can call
   chrome.tabs and chrome.storage directly — no postMessage bridge needed.

   What this file does:
   1. Reads open browser tabs directly via chrome.tabs.query()
   2. Groups tabs by domain with a landing pages category
   3. Renders domain cards, banners, and stats
   4. Handles all user actions (close tabs, save for later, focus tab)
   5. Stores "Saved for Later" tabs in chrome.storage.local (no server)
   ================================================================ */

'use strict';

const {
  escapeHtmlAttribute,
  getFallbackLabel,
  getGroupIcon,
  getIconSources,
} = globalThis.TabOutIconUtils || {};

const {
  addSessionGroup,
  assignTabToSessionGroup,
  clearTabSessionGroup,
  normalizeSessionGroups,
  pruneSessionGroups,
} = globalThis.TabOutSessionGroups || {};

const {
  applyGroupOrder,
  createReorderedKeys,
  normalizeGroupOrderState,
  setPinEnabled,
} = globalThis.TabOutGroupOrder || {};

const {
  clampTriggerTop,
  normalizeTriggerPosition,
} = globalThis.TabOutDeferredTriggerPosition || {};

const {
  reorderSubsetByIds,
} = globalThis.TabOutListOrder || {};

const {
  completeTodo,
  clearArchivedTodos,
  createTodo,
  deleteTodo,
  normalizeTodos,
  searchTodos,
  splitTodos,
  updateTodo,
} = globalThis.TabOutTodosStore || {};


/* ----------------------------------------------------------------
   CHROME TABS — Direct API Access

   Since this page IS the extension's new tab page, it has full
   access to chrome.tabs and chrome.storage. No middleman needed.
   ---------------------------------------------------------------- */

// All open tabs — populated by fetchOpenTabs()
let openTabs = [];
let sessionGroupsState = normalizeSessionGroups ? normalizeSessionGroups() : { groups: [], assignments: {} };
const SESSION_GROUPS_KEY = 'sessionGroups';
let groupOrderState = normalizeGroupOrderState ? normalizeGroupOrderState() : { sessionOrder: [], pinnedOrder: [], pinEnabled: false };
const GROUP_ORDER_KEY = 'groupOrder';
let groupTabOrderState = {};
const GROUP_TAB_ORDER_KEY = 'groupTabOrder';
let draggedGroupId = '';
let dragStartPoint = null;
let suppressJumpUntil = 0;
let draggedGroupButtonEl = null;
let dragPlaceholderEl = null;
let deferredPanelOpen = false;
let deferredTriggerPosition = normalizeTriggerPosition ? normalizeTriggerPosition() : { top: null };
const DEFERRED_TRIGGER_POSITION_KEY = 'deferredTriggerPosition';
let deferredTriggerDragState = null;
let deferredTriggerSuppressClickUntil = 0;
let drawerView = 'saved';
let todoDetailId = '';
let todoSearchOpen = false;
let todoSearchQuery = '';
let savedSearchOpen = false;
let savedSearchQuery = '';
let draggedDrawerItemId = '';
let draggedDrawerItemEl = null;
let drawerItemDragState = null;
let drawerItemPlaceholderEl = null;
let draggedPageChipId = '';
let draggedPageChipEl = null;
let pageChipDragState = null;
let pageChipPlaceholderEl = null;
let themeMenuOpen = false;
const TODOS_KEY = 'todos';
const THEME_PREFERENCES_KEY = 'themePreferences';
const QUICK_SHORTCUTS_KEY = 'quickShortcuts';

const THEMES = {
  paper: {
    name: 'Paper',
    meta: 'Warm neutral',
    vars: {
      '--ink': '#1a1613',
      '--paper': '#f8f5f0',
      '--warm-gray': '#e8e2da',
      '--muted': '#9a918a',
      '--accent-amber': '#c8713a',
      '--accent-sage': '#5a7a62',
      '--accent-slate': '#5a6b7a',
      '--accent-rose': '#b35a5a',
      '--workspace-accent': '#8a653f',
      '--workspace-accent-soft': '#f2e7db',
      '--workspace-accent-border': '#d4b396',
      '--workspace-accent-contrast': '#fffaf5',
      '--status-active': '#3d7a4a',
      '--status-cooling': '#b8892e',
      '--status-abandoned': '#b35a5a',
      '--card-bg': '#fffdf9',
    },
  },
  sage: {
    name: 'Sage',
    meta: 'Soft green',
    vars: {
      '--ink': '#172018',
      '--paper': '#eef2eb',
      '--warm-gray': '#dbe3d7',
      '--muted': '#7f8c81',
      '--accent-amber': '#8b7146',
      '--accent-sage': '#4d6f57',
      '--accent-slate': '#5e7072',
      '--accent-rose': '#9a6860',
      '--workspace-accent': '#4f7657',
      '--workspace-accent-soft': '#deebe1',
      '--workspace-accent-border': '#9ebda6',
      '--workspace-accent-contrast': '#f6fbf7',
      '--status-active': '#446953',
      '--status-cooling': '#907548',
      '--status-abandoned': '#996760',
      '--card-bg': '#fafcf8',
    },
  },
  mist: {
    name: 'Mist',
    meta: 'Cool neutral',
    vars: {
      '--ink': '#161c21',
      '--paper': '#eef2f5',
      '--warm-gray': '#d8dee5',
      '--muted': '#7d8791',
      '--accent-amber': '#927255',
      '--accent-sage': '#5d7569',
      '--accent-slate': '#4f687a',
      '--accent-rose': '#9b6b71',
      '--workspace-accent': '#4f6d88',
      '--workspace-accent-soft': '#dde7f0',
      '--workspace-accent-border': '#9fb2c5',
      '--workspace-accent-contrast': '#f7fafc',
      '--status-active': '#4e6c61',
      '--status-cooling': '#94724a',
      '--status-abandoned': '#93636c',
      '--card-bg': '#fafcfd',
    },
  },
  blush: {
    name: 'Blush',
    meta: 'Soft clay',
    vars: {
      '--ink': '#201716',
      '--paper': '#f6efec',
      '--warm-gray': '#e5d8d2',
      '--muted': '#97827c',
      '--accent-amber': '#a06d4f',
      '--accent-sage': '#6a7866',
      '--accent-slate': '#64707a',
      '--accent-rose': '#ad6966',
      '--workspace-accent': '#a5656f',
      '--workspace-accent-soft': '#f2dfe1',
      '--workspace-accent-border': '#d2a1a7',
      '--workspace-accent-contrast': '#fff7f8',
      '--status-active': '#5a7162',
      '--status-cooling': '#9c7448',
      '--status-abandoned': '#a96262',
      '--card-bg': '#fffaf7',
    },
  },
};

let themePreferences = {
  themeId: 'paper',
  customBackground: '',
  surfaceOpacity: 14,
};

function normalizeThemePreferences(input) {
  const next = input && typeof input === 'object' ? input : {};
  const themeId = String(next.themeId || 'paper');
  const rawOpacity = Number(next.surfaceOpacity);
  const surfaceOpacity = Number.isFinite(rawOpacity)
    ? Math.min(60, Math.max(8, Math.round(rawOpacity)))
    : 14;
  return {
    themeId: THEMES[themeId] ? themeId : 'paper',
    customBackground: typeof next.customBackground === 'string' ? next.customBackground : '',
    surfaceOpacity,
  };
}

function normalizeQuickShortcuts(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(item => item && item.url)
    .map(item => ({
      id: String(item.id || `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      url: String(item.url).trim(),
      label: String(item.label || '').trim(),
    }))
    .filter(item => item.url);
}

function getThemeDefinition(themeId) {
  return THEMES[themeId] || THEMES.paper;
}

function hexToRgbChannels(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '248 245 240';

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyThemePreferences() {
  const root = document.documentElement;
  const body = document.body;
  const theme = getThemeDefinition(themePreferences.themeId);
  const surfaceOpacity = themePreferences.surfaceOpacity;
  const borderOpacity = Math.max(8, surfaceOpacity);
  const badgeOpacity = Math.max(3, Math.round(surfaceOpacity * 0.28));
  const fallbackOpacity = Math.max(4, Math.round(surfaceOpacity * 0.36));

  Object.entries(theme.vars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
  root.style.setProperty('--custom-surface-opacity', `${surfaceOpacity}%`);
  root.style.setProperty('--custom-border-opacity', `${borderOpacity}%`);
  root.style.setProperty('--custom-badge-opacity', `${badgeOpacity}%`);
  root.style.setProperty('--custom-fallback-opacity', `${fallbackOpacity}%`);

  if (themePreferences.customBackground) {
    root.style.setProperty('--page-custom-background', `url("${themePreferences.customBackground}")`);
    if (body) {
      const paperRgb = hexToRgbChannels(theme.vars['--paper']);
      body.style.backgroundImage = `linear-gradient(rgba(${paperRgb} / 0.26), rgba(${paperRgb} / 0.26)), url("${themePreferences.customBackground}")`;
      body.classList.add('has-custom-background');
    }
  } else {
    root.style.setProperty('--page-custom-background', 'none');
    if (body) {
      body.style.removeProperty('background-image');
      body.classList.remove('has-custom-background');
    }
  }
}

function renderThemeMenu() {
  const trigger = document.getElementById('themeMenuTrigger');
  const pinToggle = document.getElementById('headerPinToggle');
  const panel = document.getElementById('themeMenuPanel');
  const options = document.getElementById('themeOptions');
  const transparencyRange = document.getElementById('themeTransparencyRange');
  const transparencyValue = document.getElementById('themeTransparencyValue');
  if (!trigger || !panel || !options || !transparencyRange || !transparencyValue) return;

  trigger.setAttribute('aria-expanded', String(themeMenuOpen));
  panel.hidden = !themeMenuOpen;
  transparencyRange.value = String(themePreferences.surfaceOpacity);
  transparencyValue.textContent = `${themePreferences.surfaceOpacity}%`;
  if (pinToggle) {
    const pinTooltip = groupOrderState.pinEnabled ? 'Pinned order' : 'Pin order';
    pinToggle.classList.toggle('is-active', groupOrderState.pinEnabled);
    pinToggle.dataset.tooltip = pinTooltip;
    pinToggle.setAttribute('aria-label', pinTooltip);
    pinToggle.setAttribute('aria-pressed', String(groupOrderState.pinEnabled));
  }

  options.innerHTML = Object.entries(THEMES).map(([id, theme]) => `
    <button
      class="theme-option ${themePreferences.themeId === id ? 'is-active' : ''}"
      data-action="select-theme"
      data-theme-id="${id}"
      style="--theme-paper:${theme.vars['--paper']};--theme-accent:${theme.vars['--accent-amber']};"
    >
      <span class="theme-option-main">
        <span class="theme-option-swatch" aria-hidden="true"></span>
        <span>
          <span class="theme-option-name">${theme.name}</span>
          <span class="theme-option-meta">${theme.meta}</span>
        </span>
      </span>
      <span class="theme-option-check" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
      </span>
    </button>
  `).join('');
}

async function getQuickShortcuts() {
  const stored = await chrome.storage.local.get(QUICK_SHORTCUTS_KEY);
  return normalizeQuickShortcuts(stored[QUICK_SHORTCUTS_KEY]);
}

async function saveQuickShortcuts(shortcuts) {
  const normalized = normalizeQuickShortcuts(shortcuts);
  await chrome.storage.local.set({ [QUICK_SHORTCUTS_KEY]: normalized });
  return normalized;
}

function normalizeShortcutUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return '';
  }
}

function getShortcutLabel(shortcut) {
  if (shortcut.label) return shortcut.label;

  try {
    return friendlyDomain(new URL(shortcut.url).hostname);
  } catch {
    return shortcut.url;
  }
}

function renderQuickShortcutCard(shortcut) {
  const label = getShortcutLabel(shortcut);
  const iconData = getIconSources({ url: shortcut.url, title: label }, 32);
  const faviconUrl = iconData.sources[0] || '';
  const fallbackUrl = iconData.sources[1] || '';
  const fallbackLabel = getFallbackLabel(label, iconData.hostname);
  const safeId = escapeHtmlAttribute ? escapeHtmlAttribute(shortcut.id) : shortcut.id.replace(/"/g, '&quot;');
  const safeUrl = escapeHtmlAttribute ? escapeHtmlAttribute(shortcut.url) : shortcut.url.replace(/"/g, '&quot;');

  return `
    <button class="quick-shortcut-card" data-action="open-quick-shortcut" data-shortcut-url="${safeUrl}" aria-label="${label}">
      <span class="quick-shortcut-remove" data-action="remove-quick-shortcut" data-shortcut-id="${safeId}" role="button" aria-label="Remove quick tab">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </span>
      <span class="quick-shortcut-icon-wrap">
        ${faviconUrl ? `<img class="quick-shortcut-icon" src="${faviconUrl}" alt="" onerror="handleIconError(this, '${fallbackUrl}')">` : ''}
        <span class="quick-shortcut-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>
      </span>
      <span class="quick-shortcut-label">${label}</span>
    </button>
  `;
}

function renderQuickShortcutAddCard() {
  return `
    <button class="quick-shortcut-card is-add" data-action="add-quick-shortcut" aria-label="Add quick tab">
      <span class="quick-shortcut-icon-wrap">
        <svg class="quick-shortcut-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 5.25v13.5m6.75-6.75H5.25" />
        </svg>
      </span>
      <span class="quick-shortcut-label" aria-hidden="true"></span>
    </button>
  `;
}

async function renderQuickShortcuts() {
  const list = document.getElementById('quickTabsList');
  if (!list) return;

  const shortcuts = await getQuickShortcuts();
  list.innerHTML = `${shortcuts.map(renderQuickShortcutCard).join('')}${renderQuickShortcutAddCard()}`;
}

async function loadThemePreferences() {
  const stored = await chrome.storage.local.get(THEME_PREFERENCES_KEY);
  themePreferences = normalizeThemePreferences(stored[THEME_PREFERENCES_KEY]);
  applyThemePreferences();
  renderThemeMenu();
  return themePreferences;
}

async function saveThemePreferences(nextPreferences) {
  themePreferences = normalizeThemePreferences({
    ...themePreferences,
    ...nextPreferences,
  });
  await chrome.storage.local.set({ [THEME_PREFERENCES_KEY]: themePreferences });
  applyThemePreferences();
  renderThemeMenu();
  return themePreferences;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function reorderVisibleItemsByIds(items, orderIds, includeItem) {
  if (reorderSubsetByIds) {
    return reorderSubsetByIds(items, orderIds, includeItem);
  }

  if (!Array.isArray(items)) return [];
  const list = items.slice();
  const shouldInclude = typeof includeItem === 'function' ? includeItem : () => true;
  const subset = list.filter(shouldInclude);
  const normalizedOrder = Array.isArray(orderIds) ? orderIds.map(id => String(id)).filter(Boolean) : [];
  if (!subset.length || subset.length !== normalizedOrder.length) return list;

  const subsetMap = new Map(subset.map(item => [String(item.id), item]));
  if (normalizedOrder.some(id => !subsetMap.has(id))) return list;

  let nextIndex = 0;
  return list.map(item => {
    if (!shouldInclude(item)) return item;
    const nextItem = subsetMap.get(normalizedOrder[nextIndex]);
    nextIndex += 1;
    return nextItem || item;
  });
}

function normalizeGroupTabOrderState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.fromEntries(
    Object.entries(input)
      .map(([groupKey, orderIds]) => [
        String(groupKey),
        Array.isArray(orderIds)
          ? [...new Set(orderIds.map(id => String(id)).filter(Boolean))]
          : [],
      ])
      .filter(([, orderIds]) => orderIds.length > 0)
  );
}

function pruneGroupTabOrderState(state, groups = []) {
  const normalized = normalizeGroupTabOrderState(state);
  const groupMap = new Map(
    groups.map(group => [
      String(group.domain),
      new Set(
        (group.tabs || [])
          .map(tab => String(tab?.url || ''))
          .filter(Boolean)
      ),
    ])
  );

  return Object.fromEntries(
    Object.entries(normalized)
      .map(([groupKey, orderIds]) => {
        const validUrls = groupMap.get(String(groupKey));
        if (!validUrls) return null;
        const filtered = orderIds.filter(url => validUrls.has(url));
        return filtered.length > 0 ? [String(groupKey), filtered] : null;
      })
      .filter(Boolean)
  );
}

async function loadGroupTabOrder(groups = []) {
  const stored = await chrome.storage.local.get(GROUP_TAB_ORDER_KEY);
  const nextState = normalizeGroupTabOrderState(stored[GROUP_TAB_ORDER_KEY]);
  const prunedState = pruneGroupTabOrderState(nextState, groups);
  groupTabOrderState = prunedState;
  await chrome.storage.local.set({ [GROUP_TAB_ORDER_KEY]: prunedState });
  return prunedState;
}

async function saveGroupTabOrder(nextState) {
  groupTabOrderState = normalizeGroupTabOrderState(nextState);
  await chrome.storage.local.set({ [GROUP_TAB_ORDER_KEY]: groupTabOrderState });
  return groupTabOrderState;
}

function reorderGroupTabsByStoredUrls(tabs, groupKey) {
  const orderIds = groupTabOrderState[String(groupKey)] || [];
  if (!Array.isArray(tabs) || !tabs.length || !orderIds.length) return Array.isArray(tabs) ? tabs.slice() : [];

  const wrappedTabs = tabs.map(tab => ({
    id: String(tab?.url || ''),
    tab,
  }));
  const subsetUrls = new Set(orderIds);
  const reordered = reorderVisibleItemsByIds(
    wrappedTabs,
    orderIds,
    item => subsetUrls.has(item.id)
  );
  return reordered.map(item => item.tab);
}

function getOrderedUniqueTabsForGroup(group) {
  const tabs = Array.isArray(group?.tabs) ? group.tabs : [];
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    const url = String(tab?.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    uniqueTabs.push(tab);
  }
  return reorderGroupTabsByStoredUrls(uniqueTabs, group?.domain);
}

async function loadDeferredTriggerPosition() {
  const stored = await chrome.storage.local.get(DEFERRED_TRIGGER_POSITION_KEY);
  deferredTriggerPosition = normalizeTriggerPosition(stored[DEFERRED_TRIGGER_POSITION_KEY]);
  return deferredTriggerPosition;
}

async function saveDeferredTriggerPosition(nextState) {
  deferredTriggerPosition = normalizeTriggerPosition(nextState);
  await chrome.storage.local.set({ [DEFERRED_TRIGGER_POSITION_KEY]: deferredTriggerPosition });
  return deferredTriggerPosition;
}

function isMobileDeferredLayout() {
  return window.matchMedia('(max-width: 960px)').matches;
}

function applyDeferredTriggerPosition() {
  const triggerStack = document.getElementById('drawerTriggerStack');
  if (!triggerStack) return;

  if (isMobileDeferredLayout()) {
    triggerStack.style.removeProperty('top');
    return;
  }

  const triggerHeight = triggerStack.offsetHeight || 94;
  const normalizedTop = clampTriggerTop(
    deferredTriggerPosition.top ?? window.innerHeight / 2 - triggerHeight / 2,
    window.innerHeight,
    triggerHeight,
    24
  );
  triggerStack.style.top = `${normalizedTop}px`;
}

/**
 * fetchOpenTabs()
 *
 * Reads all currently open browser tabs directly from Chrome.
 * Sets the extensionId flag so we can identify Tab Harbor's own pages.
 */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    // The new URL for this page is now index.html (not newtab.html)
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;

    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map(t => ({
      id:       t.id,
      url:      t.url,
      title:    t.title,
      windowId: t.windowId,
      active:   t.active,
      favIconUrl: t.favIconUrl || '',
      // Flag Tab Harbor's own pages so we can detect duplicate new tabs
      isTabOut: t.url === newtabUrl || t.url === 'chrome://newtab/',
    }));
  } catch {
    // chrome.tabs API unavailable (shouldn't happen in an extension page)
    openTabs = [];
  }
}

async function loadSessionGroups(openTabIds = []) {
  const stored = await chrome.storage.local.get(SESSION_GROUPS_KEY);
  const nextState = normalizeSessionGroups(stored[SESSION_GROUPS_KEY]);
  const prunedState = pruneSessionGroups(nextState, openTabIds);
  sessionGroupsState = prunedState;
  await chrome.storage.local.set({ [SESSION_GROUPS_KEY]: prunedState });
  return prunedState;
}

async function saveSessionGroups(nextState) {
  sessionGroupsState = normalizeSessionGroups(nextState);
  await chrome.storage.local.set({ [SESSION_GROUPS_KEY]: sessionGroupsState });
  return sessionGroupsState;
}

async function loadGroupOrder() {
  const stored = await chrome.storage.local.get(GROUP_ORDER_KEY);
  groupOrderState = normalizeGroupOrderState(stored[GROUP_ORDER_KEY]);
  return groupOrderState;
}

async function saveGroupOrder(nextState) {
  groupOrderState = normalizeGroupOrderState(nextState);
  await chrome.storage.local.set({ [GROUP_ORDER_KEY]: groupOrderState });
  return groupOrderState;
}

function updateGroupNavButtonIcon(groupKey) {
  const group = domainGroups.find(item => String(item.domain) === String(groupKey));
  const button = document.querySelector(`.group-nav-button[data-group-id="${CSS.escape(String(groupKey))}"]`);
  if (!group || !button || !getGroupIcon) return;

  const label = group.domain === '__landing-pages__' ? 'Homepages' : (group.label || friendlyDomain(group.domain));
  const orderedGroup = {
    ...group,
    tabs: getOrderedUniqueTabsForGroup(group),
  };
  const iconData = getGroupIcon(orderedGroup, label, 32);
  const img = button.querySelector('.group-nav-icon');
  const fallback = button.querySelector('.group-nav-fallback');

  if (img && iconData.src) {
    img.src = iconData.src;
    img.setAttribute('onerror', `handleIconError(this, '${iconData.fallbackSrc}')`);
    img.style.display = '';
    if (fallback) {
      fallback.textContent = iconData.fallbackLabel;
      fallback.style.display = 'none';
    }
    return;
  }

  if (img) img.style.display = 'none';
  if (fallback) {
    fallback.textContent = iconData.fallbackLabel;
    fallback.style.display = '';
  }
}

function animatePageChipItems(listEl, previousRects) {
  listEl?.querySelectorAll('[data-chip-sort-id]').forEach(item => {
    if (item.classList.contains('is-dragging')) return;

    const key = item.dataset.chipSortId || '';
    const previousRect = previousRects.get(key);
    if (!previousRect) return;

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (!deltaX && !deltaY) return;

    item.style.transition = 'none';
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      item.style.transition = 'transform 0.16s ease';
      item.style.transform = '';
    });
  });
}

function syncGroupOrderState(orderKeys) {
  groupOrderState = normalizeGroupOrderState({
    ...groupOrderState,
    sessionOrder: orderKeys,
    pinnedOrder: groupOrderState.pinEnabled ? orderKeys : groupOrderState.pinnedOrder,
  });
  return groupOrderState;
}

function getStableGroupId(groupKey) {
  return 'domain-' + String(groupKey).replace(/[^a-z0-9]/g, '-');
}

function animateNavButtons(navListEl, previousRects) {
  navListEl?.querySelectorAll('.group-nav-button').forEach(button => {
    if (button.classList.contains('is-dragging')) return;

    const key = button.dataset.groupId || '';
    const previousRect = previousRects.get(key);
    if (!previousRect) return;

    const nextRect = button.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (!deltaX && !deltaY) return;

    button.style.transition = 'none';
    button.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      button.style.transition = 'transform 0.16s ease';
      button.style.transform = '';
    });
  });
}

function applyLiveGroupOrder(orderKeys, options = {}) {
  const keyOrder = orderKeys.map(String);
  const groupMap = new Map(domainGroups.map(group => [String(group.domain), group]));
  domainGroups = keyOrder.map(key => groupMap.get(key)).filter(Boolean);
  syncGroupOrderState(domainGroups.map(group => group.domain));

  const missionsEl = document.getElementById('openTabsMissions');
  const navListEl = document.querySelector('#openTabsGroupNav .group-nav-list');
  if (options.reorderCards !== false) {
    keyOrder.forEach(key => {
      const card = missionsEl?.querySelector(`.mission-card[data-group-id="${CSS.escape(String(key))}"]`);
      if (card) missionsEl.appendChild(card);
    });
  }

  if (options.reorderNav === false || !navListEl) return;

  const previousNavRects = new Map();
  navListEl.querySelectorAll('.group-nav-button').forEach(button => {
    previousNavRects.set(button.dataset.groupId || '', button.getBoundingClientRect());
  });

  keyOrder.forEach(key => {
    const button = navListEl.querySelector(`.group-nav-button[data-group-id="${CSS.escape(String(key))}"]`);
    if (button) navListEl.appendChild(button);
  });

  animateNavButtons(navListEl, previousNavRects);
}

function clearGroupDragState() {
  draggedGroupId = '';
  dragStartPoint = null;
  draggedGroupButtonEl = null;
  dragPlaceholderEl?.remove();
  dragPlaceholderEl = null;
  document.body.classList.remove('group-dragging');
  document.querySelectorAll('.group-nav-button.is-dragging').forEach(button => {
    button.classList.remove('is-dragging');
    button.style.removeProperty('--drag-left');
    button.style.removeProperty('--drag-top');
  });
}

function animateDrawerListItems(listEl, previousRects) {
  listEl?.querySelectorAll('[data-drawer-sort-id]').forEach(item => {
    if (item.classList.contains('is-dragging')) return;

    const key = item.dataset.drawerSortId || '';
    const previousRect = previousRects.get(key);
    if (!previousRect) return;

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (!deltaX && !deltaY) return;

    item.style.transition = 'none';
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      item.style.transition = 'transform 0.16s ease';
      item.style.transform = '';
    });
  });
}

function ensureDrawerItemPlaceholder() {
  if (drawerItemPlaceholderEl || !draggedDrawerItemEl) return drawerItemPlaceholderEl;

  drawerItemPlaceholderEl = document.createElement('div');
  drawerItemPlaceholderEl.className = 'drawer-reorder-placeholder';
  drawerItemPlaceholderEl.style.height = `${draggedDrawerItemEl.getBoundingClientRect().height}px`;
  draggedDrawerItemEl.insertAdjacentElement('afterend', drawerItemPlaceholderEl);
  return drawerItemPlaceholderEl;
}

function clearDrawerItemDragState() {
  draggedDrawerItemId = '';
  drawerItemDragState = null;
  drawerItemPlaceholderEl?.remove();
  drawerItemPlaceholderEl = null;
  document.body.classList.remove('drawer-list-dragging');

  if (draggedDrawerItemEl) {
    draggedDrawerItemEl.classList.remove('is-dragging');
    draggedDrawerItemEl.style.removeProperty('--drag-left');
    draggedDrawerItemEl.style.removeProperty('--drag-top');
    draggedDrawerItemEl.style.removeProperty('--drag-width');
  }

  draggedDrawerItemEl = null;
}

function ensurePageChipPlaceholder() {
  if (pageChipPlaceholderEl || !draggedPageChipEl) return pageChipPlaceholderEl;

  pageChipPlaceholderEl = document.createElement('div');
  pageChipPlaceholderEl.className = 'chip-reorder-placeholder';
  pageChipPlaceholderEl.style.height = `${draggedPageChipEl.getBoundingClientRect().height}px`;
  draggedPageChipEl.insertAdjacentElement('afterend', pageChipPlaceholderEl);
  return pageChipPlaceholderEl;
}

function clearPageChipDragState() {
  draggedPageChipId = '';
  pageChipDragState = null;
  pageChipPlaceholderEl?.remove();
  pageChipPlaceholderEl = null;
  document.body.classList.remove('page-chip-list-dragging');

  if (draggedPageChipEl) {
    draggedPageChipEl.classList.remove('is-dragging');
    draggedPageChipEl.style.removeProperty('--drag-left');
    draggedPageChipEl.style.removeProperty('--drag-top');
    draggedPageChipEl.style.removeProperty('--drag-width');
  }

  draggedPageChipEl = null;
}

function updateDraggedPageChipPosition(clientX, clientY) {
  if (!draggedPageChipEl || !pageChipDragState) return;

  draggedPageChipEl.style.setProperty('--drag-left', `${clientX - pageChipDragState.offsetX}px`);
  draggedPageChipEl.style.setProperty('--drag-top', `${clientY - pageChipDragState.offsetY}px`);
}

function previewPageChipOrder(clientY) {
  const listEl = pageChipDragState?.listEl;
  if (!listEl || !draggedPageChipId) return;

  const placeholder = ensurePageChipPlaceholder();
  const previousRects = new Map();
  const items = [...listEl.querySelectorAll('[data-chip-sort-id]:not(.is-dragging)')];

  items.forEach(item => {
    previousRects.set(item.dataset.chipSortId || '', item.getBoundingClientRect());
  });

  let insertBeforeItem = null;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBeforeItem = item;
      break;
    }
  }

  if (insertBeforeItem) {
    listEl.insertBefore(placeholder, insertBeforeItem);
  } else {
    listEl.appendChild(placeholder);
  }

  animatePageChipItems(listEl, previousRects);
}

async function saveGroupTabRowOrder(groupKey, orderUrls) {
  if (!groupKey || !Array.isArray(orderUrls) || !orderUrls.length) return;

  await saveGroupTabOrder({
    ...groupTabOrderState,
    [String(groupKey)]: orderUrls.map(url => String(url)).filter(Boolean),
  });
}

function updateDraggedDrawerItemPosition(clientX, clientY) {
  if (!draggedDrawerItemEl || !drawerItemDragState) return;

  draggedDrawerItemEl.style.setProperty('--drag-left', `${clientX - drawerItemDragState.offsetX}px`);
  draggedDrawerItemEl.style.setProperty('--drag-top', `${clientY - drawerItemDragState.offsetY}px`);
}

function previewDrawerItemOrder(clientY) {
  const listEl = drawerItemDragState?.listEl;
  if (!listEl || !draggedDrawerItemId) return;

  const placeholder = ensureDrawerItemPlaceholder();
  const previousRects = new Map();
  const items = [...listEl.querySelectorAll('[data-drawer-sort-id]:not(.is-dragging)')];

  items.forEach(item => {
    previousRects.set(item.dataset.drawerSortId || '', item.getBoundingClientRect());
  });

  let insertBeforeItem = null;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBeforeItem = item;
      break;
    }
  }

  if (insertBeforeItem) {
    listEl.insertBefore(placeholder, insertBeforeItem);
  } else {
    listEl.appendChild(placeholder);
  }

  animateDrawerListItems(listEl, previousRects);
}

async function reorderSavedTabs(orderIds) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const nextDeferred = reorderVisibleItemsByIds(
    deferred,
    orderIds,
    item => item && item.id && !item.completed && !item.dismissed
  );
  await chrome.storage.local.set({ deferred: nextDeferred });
  return nextDeferred;
}

async function reorderTodoItems(orderIds) {
  const todos = await getTodos();
  const nextTodos = reorderVisibleItemsByIds(
    todos,
    orderIds,
    todo => todo && todo.id && !todo.completed && !todo.dismissed
  );
  return saveTodos(nextTodos);
}

async function saveDrawerItemOrder(kind, orderIds) {
  if (!Array.isArray(orderIds) || !orderIds.length) return;

  if (kind === 'saved') {
    await reorderSavedTabs(orderIds);
    return;
  }

  if (kind === 'todo') {
    await reorderTodoItems(orderIds);
  }
}

function updateDraggedButtonPosition(clientX, clientY) {
  if (!draggedGroupButtonEl || !dragStartPoint) return;
  draggedGroupButtonEl.style.setProperty('--drag-left', `${clientX - dragStartPoint.offsetX}px`);
  draggedGroupButtonEl.style.setProperty('--drag-top', `${clientY - dragStartPoint.offsetY}px`);
}

function ensureDragPlaceholder() {
  if (dragPlaceholderEl || !draggedGroupButtonEl) return dragPlaceholderEl;

  dragPlaceholderEl = document.createElement('div');
  dragPlaceholderEl.className = 'group-nav-placeholder';
  draggedGroupButtonEl.insertAdjacentElement('afterend', dragPlaceholderEl);
  return dragPlaceholderEl;
}

function previewDraggedOrder(clientX) {
  const navListEl = document.querySelector('#openTabsGroupNav .group-nav-list');
  if (!navListEl || !draggedGroupId) return;

  const placeholder = ensureDragPlaceholder();
  const previousNavRects = new Map();
  navListEl.querySelectorAll('.group-nav-button:not(.is-dragging)').forEach(button => {
    previousNavRects.set(button.dataset.groupId || '', button.getBoundingClientRect());
  });

  const buttons = [...navListEl.querySelectorAll('.group-nav-button:not(.is-dragging)')];
  let insertBeforeButton = null;

  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) {
      insertBeforeButton = button;
      break;
    }
  }

  if (insertBeforeButton) {
    navListEl.insertBefore(placeholder, insertBeforeButton);
  } else {
    navListEl.appendChild(placeholder);
  }

  animateNavButtons(navListEl, previousNavRects);

  const previewOrderKeys = [...navListEl.children]
    .map(node => {
      if (node === placeholder) return draggedGroupId;
      if (node.classList?.contains('group-nav-button') && !node.classList.contains('is-dragging')) {
        return node.dataset.groupId || '';
      }
      return '';
    })
    .filter(Boolean);

  if (previewOrderKeys.length > 0) {
    applyLiveGroupOrder(previewOrderKeys, { reorderCards: false, reorderNav: false });
  }
}

async function removeTabAssignments(tabIds = []) {
  if (!tabIds.length) return sessionGroupsState;

  let nextState = sessionGroupsState;
  for (const tabId of tabIds) {
    nextState = clearTabSessionGroup(nextState, tabId);
  }

  nextState = pruneSessionGroups(nextState, openTabs.map(tab => tab.id));
  return saveSessionGroups(nextState);
}

function buildMoveMenu(tab) {
  const currentGroupId = tab.manualGroupId || '';
  const otherGroups = sessionGroupsState.groups.filter(group => group.id !== currentGroupId);
  const groupButtons = otherGroups.map(group => `
    <button
      class="move-menu-btn"
      data-action="move-tab-to-group"
      data-tab-id="${tab.id}"
      data-group-id="${group.id}"
    >
      ${group.name}
    </button>`).join('');

  return `
    <div class="chip-move-wrap">
      <button
        class="chip-action chip-move-trigger"
        data-action="toggle-move-menu"
        data-tab-id="${tab.id}"
        title="Move to group"
      >
        ${ICONS.move}
      </button>
      <div class="chip-move-menu" hidden>
        ${groupButtons || '<div class="move-menu-empty">No groups yet</div>'}
        <button class="move-menu-btn move-menu-btn-primary" data-action="move-tab-to-new-group" data-tab-id="${tab.id}">
          + New group
        </button>
        ${currentGroupId ? `<button class="move-menu-btn" data-action="move-tab-to-original" data-tab-id="${tab.id}">Back to original group</button>` : ''}
      </div>
    </div>`;
}

function closeMoveMenus() {
  document.querySelectorAll('.chip-move-menu').forEach(menu => {
    menu.hidden = true;
  });
  document.querySelectorAll('.chip-move-trigger.is-open').forEach(trigger => {
    trigger.classList.remove('is-open');
  });
}

/**
 * closeTabsByUrls(urls)
 *
 * Closes all open tabs whose hostname matches any of the given URLs.
 * After closing, re-fetches the tab list to keep our state accurate.
 *
 * Special case: file:// URLs are matched exactly (they have no hostname).
 */
async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  // Separate file:// URLs (exact match) from regular URLs (hostname match)
  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith('file://')) {
      exactUrls.add(u);
    } else {
      try { targetHostnames.push(new URL(u).hostname); }
      catch { /* skip unparseable */ }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(tab => {
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('file://') && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch { return false; }
    })
    .map(tab => tab.id);

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

/**
 * closeTabsExact(urls)
 *
 * Closes tabs by exact URL match (not hostname). Used for landing pages
 * so closing "Gmail inbox" doesn't also close individual email threads.
 */
async function closeTabsExact(urls) {
  if (!urls || urls.length === 0) return;
  const urlSet = new Set(urls);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs.filter(t => urlSet.has(t.url)).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

/**
 * focusTab(url)
 *
 * Switches Chrome to the tab with the given URL (exact match first,
 * then hostname fallback). Also brings the window to the front.
 */
async function focusTab(url) {
  if (!url) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  // Try exact URL match first
  let matches = allTabs.filter(t => t.url === url);

  // Fall back to hostname match
  if (matches.length === 0) {
    try {
      const targetHost = new URL(url).hostname;
      matches = allTabs.filter(t => {
        try { return new URL(t.url).hostname === targetHost; }
        catch { return false; }
      });
    } catch {}
  }

  if (matches.length === 0) return false;

  // Prefer a match in a different window so it actually switches windows
  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
  return true;
}

async function openOrFocusUrl(url) {
  const focused = await focusTab(url);
  if (focused) return true;
  await chrome.tabs.create({ url });
  return false;
}

async function runDefaultSearch(query) {
  const text = String(query || '').trim();
  if (!text) return;

  if (chrome.search?.query) {
    await chrome.search.query({
      text,
      disposition: 'CURRENT_TAB',
    });
    return;
  }

  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  await chrome.tabs.create({ url: fallbackUrl });
}

/**
 * closeDuplicateTabs(urls, keepOne)
 *
 * Closes duplicate tabs for the given list of URLs.
 * keepOne=true → keep one copy of each, close the rest.
 * keepOne=false → close all copies.
 */
async function closeDuplicateTabs(urls, keepOne = true) {
  const allTabs = await chrome.tabs.query({});
  const toClose = [];

  for (const url of urls) {
    const matching = allTabs.filter(t => t.url === url);
    if (keepOne) {
      const keep = matching.find(t => t.active) || matching[0];
      for (const tab of matching) {
        if (tab.id !== keep.id) toClose.push(tab.id);
      }
    } else {
      for (const tab of matching) toClose.push(tab.id);
    }
  }

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

/**
 * closeTabOutDupes()
 *
 * Closes all duplicate Tab Harbor new-tab pages except the current one.
 */
async function closeTabOutDupes() {
  const extensionId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extensionId}/index.html`;

  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();
  const tabOutTabs = allTabs.filter(t =>
    t.url === newtabUrl || t.url === 'chrome://newtab/'
  );

  if (tabOutTabs.length <= 1) return;

  // Keep the active Tab Harbor tab in the CURRENT window — that's the one the
  // user is looking at right now. Falls back to any active one, then the first.
  const keep =
    tabOutTabs.find(t => t.active && t.windowId === currentWindow.id) ||
    tabOutTabs.find(t => t.active) ||
    tabOutTabs[0];
  const toClose = tabOutTabs.filter(t => t.id !== keep.id).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — chrome.storage.local

   Replaces the old server-side SQLite + REST API with Chrome's
   built-in key-value storage. Data persists across browser sessions
   and doesn't require a running server.

   Data shape stored under the "deferred" key:
   [
     {
       id: "1712345678901",          // timestamp-based unique ID
       url: "https://example.com",
       title: "Example Page",
       savedAt: "2026-04-04T10:00:00.000Z",  // ISO date string
       completed: false,             // true = checked off (archived)
       dismissed: false              // true = dismissed without reading
     },
     ...
   ]
   ---------------------------------------------------------------- */

/**
 * saveTabForLater(tab)
 *
 * Saves a single tab to the "Saved for Later" list in chrome.storage.local.
 * @param {{ url: string, title: string }} tab
 */
async function saveTabForLater(tab) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  deferred.push({
    id:        Date.now().toString(),
    url:       tab.url,
    title:     tab.title,
    savedAt:   new Date().toISOString(),
    completed: false,
    dismissed: false,
  });
  await chrome.storage.local.set({ deferred });
}

/**
 * getSavedTabs()
 *
 * Returns all saved tabs from chrome.storage.local.
 * Filters out dismissed items (those are gone for good).
 * Splits into active (not completed) and archived (completed).
 */
async function getSavedTabs() {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const visible = deferred.filter(t => !t.dismissed);
  return {
    active:   visible.filter(t => !t.completed),
    archived: visible.filter(t => t.completed),
  };
}

/**
 * checkOffSavedTab(id)
 *
 * Marks a saved tab as completed (checked off). It moves to the archive.
 */
async function checkOffSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.completed = true;
    tab.completedAt = new Date().toISOString();
    await chrome.storage.local.set({ deferred });
  }
}

/**
 * dismissSavedTab(id)
 *
 * Marks a saved tab as dismissed (removed from all lists).
 */
async function dismissSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
  }
}

async function restoreSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id && !t.completed && !t.dismissed);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
    return { url: tab.url, title: tab.title };
  }
  return null;
}

async function deleteArchivedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id && t.completed && !t.dismissed);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
  }
}

async function clearArchivedTabs() {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const nextDeferred = deferred.map(tab => {
    if (tab.completed && !tab.dismissed) {
      return { ...tab, dismissed: true };
    }
    return tab;
  });
  await chrome.storage.local.set({ deferred: nextDeferred });
}

async function getTodos() {
  const stored = await chrome.storage.local.get(TODOS_KEY);
  return normalizeTodos(stored[TODOS_KEY]);
}

async function saveTodos(todos) {
  const normalized = normalizeTodos(todos);
  await chrome.storage.local.set({ [TODOS_KEY]: normalized });
  return normalized;
}

async function createTodoItem(payload) {
  const todos = await getTodos();
  return saveTodos(createTodo(todos, payload));
}

async function completeTodoItem(id) {
  const todos = await getTodos();
  return saveTodos(completeTodo(todos, id));
}

async function deleteTodoItem(id) {
  const todos = await getTodos();
  return saveTodos(deleteTodo(todos, id));
}

async function clearTodoArchiveItems() {
  const todos = await getTodos();
  return saveTodos(clearArchivedTodos(todos));
}

function renderTodoArchiveItem(todo) {
  const ago = todo.completedAt ? timeAgo(todo.completedAt) : timeAgo(todo.createdAt);
  return `
    <div class="archive-item">
      <div class="archive-item-main">
        <div class="archive-item-title">${todo.title}</div>
        <span class="archive-item-date">${ago}</span>
      </div>
      <button class="archive-item-delete" data-action="delete-todo-archive" data-todo-id="${todo.id}" title="Delete archived todo">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}

function renderTodoListItem(todo, { dragEnabled = true } = {}) {
  const ago = timeAgo(todo.createdAt);
  const dragHandle = dragEnabled
    ? `<button class="drawer-reorder-handle" type="button" data-drag-handle="todo" aria-label="Drag to reorder todo">
        ${ICONS.move}
      </button>`
    : '';
  return `
    <div class="todo-item" data-todo-id="${todo.id}" data-drawer-sort-id="${todo.id}" data-drawer-sort-kind="todo">
      <input type="checkbox" class="todo-checkbox" data-action="complete-todo" data-todo-id="${todo.id}">
      <button class="todo-main" data-action="open-todo-detail" data-todo-id="${todo.id}">
        <span class="todo-title">${todo.title}</span>
        <span class="todo-meta">${ago}</span>
      </button>
      <div class="todo-actions">
        ${dragHandle}
      </div>
    </div>`;
}

function renderTodoDetail(todo) {
  return `
    <div class="todo-detail">
      <button class="todo-back-btn" data-action="close-todo-detail">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        Back
      </button>
      <div class="todo-detail-card">
        <h3>${todo.title}</h3>
        <p>${todo.description || 'No details yet.'}</p>
        <div class="todo-detail-meta">Created ${timeAgo(todo.createdAt)}</div>
      </div>
    </div>`;
}

async function renderTodoPanel() {
  const panel = document.getElementById('todoPanel');
  const countEl = document.getElementById('todoCount');
  const list = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');
  const archive = document.getElementById('todoArchive');
  const archiveCount = document.getElementById('todoArchiveCount');
  const archiveList = document.getElementById('todoArchiveList');
  const clearArchiveBtn = document.getElementById('clearTodoArchiveBtn');
  const detail = document.getElementById('todoDetailView');
  const searchWrap = document.getElementById('todoSearchWrap');
  const searchInput = document.getElementById('todoSearchInput');

  if (!panel) return;

  const todos = await getTodos();
  const { active, archived } = splitTodos(todos);
  const filtered = searchTodos(active, todoSearchQuery);
  const todoDragEnabled = !todoSearchQuery.trim() && !todoDetailId;

  countEl.textContent = `${active.length}`;
  searchWrap.style.display = todoSearchOpen ? 'block' : 'none';
  if (searchInput && searchInput.value !== todoSearchQuery) searchInput.value = todoSearchQuery;

  if (todoDetailId) {
    const todo = active.find(item => item.id === todoDetailId);
    if (todo) {
      detail.innerHTML = renderTodoDetail(todo);
      detail.style.display = 'block';
      list.style.display = 'none';
      empty.style.display = 'none';
    } else {
      todoDetailId = '';
      detail.style.display = 'none';
    }
  } else {
    detail.style.display = 'none';
  }

  if (!todoDetailId) {
    if (filtered.length > 0) {
      list.innerHTML = filtered.map(todo => renderTodoListItem(todo, { dragEnabled: todoDragEnabled })).join('');
      list.style.display = 'block';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      empty.style.display = 'block';
    }
  }

  if (archived.length > 0) {
    archiveCount.textContent = `(${archived.length})`;
    archiveList.innerHTML = archived.map(todo => renderTodoArchiveItem(todo)).join('');
    archive.style.display = 'block';
    if (clearArchiveBtn) clearArchiveBtn.style.display = 'inline-flex';
  } else {
    archive.style.display = 'none';
    if (clearArchiveBtn) clearArchiveBtn.style.display = 'none';
  }
}

async function reopenSavedTab(url) {
  const createdTab = await chrome.tabs.create({
    url,
    active: false,
  });

  // When Chrome creates a background tab, it can briefly report about:blank
  // before the real destination is attached. Wait a moment so the dashboard
  // doesn't hide all groups during that transition.
  for (let attempt = 0; attempt < 10; attempt++) {
    const currentTab = await chrome.tabs.get(createdTab.id);
    if (currentTab?.url && currentTab.url !== 'about:blank') return currentTab;
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  return createdTab;
}


/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 */
function playCloseSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  const colors = [
    '#c8713a', // amber
    '#e8a070', // amber light
    '#5a7a62', // sage
    '#8aaa92', // sage light
    '#5a6b7a', // slate
    '#8a9baa', // slate light
    '#d4b896', // warm paper
    '#b35a5a', // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');

    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle   = Math.random() * Math.PI * 2;
    const speed   = 60 + Math.random() * 120;
    const vx      = Math.cos(angle) * speed;
    const vy      = Math.sin(angle) * speed - 80; // bias upward
    const gravity = 200;

    const startTime = performance.now();
    const duration  = 700 + Math.random() * 200; // 700–900ms

    function frame(now) {
      const elapsed  = (now - startTime) / 1000;
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) { el.remove(); return; }

      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
      const rotate  = elapsed * 200 * (isCircle ? 0 : 1);

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

/**
 * animateCardOut(card)
 *
 * Smoothly removes a mission card: fade + scale down, then confetti.
 * After the animation, checks if the grid is now empty.
 */
function animateCardOut(card) {
  if (!card) return;

  const rect = card.getBoundingClientRect();
  shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);

  card.classList.add('closing');
  setTimeout(() => {
    card.remove();
    checkAndShowEmptyState();
  }, 300);
}

/**
 * showToast(message)
 *
 * Brief pop-up notification at the bottom of the screen.
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

/**
 * checkAndShowEmptyState()
 *
 * Shows a cheerful "Inbox zero" message when all domain cards are gone.
 */
function checkAndShowEmptyState() {
  const missionsEl = document.getElementById('openTabsMissions');
  if (!missionsEl) return;

  const remaining = missionsEl.querySelectorAll('.mission-card:not(.closing)').length;
  if (remaining > 0) return;

  missionsEl.innerHTML = `
    <div class="missions-empty-state">
      <div class="empty-checkmark">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div class="empty-title">Inbox zero, but for tabs.</div>
      <div class="empty-subtitle">You're free.</div>
    </div>
  `;

  const countEl = document.getElementById('openTabsSectionCount');
  if (countEl) countEl.textContent = '0 domains';
}

/**
 * timeAgo(dateStr)
 *
 * Converts an ISO date string into a human-friendly relative time.
 * "2026-04-04T10:00:00Z" → "2 hrs ago" or "yesterday"
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr);
  const now  = new Date();
  const diffMins  = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays  = Math.floor((now - then) / 86400000);

  if (diffMins < 1)   return 'just now';
  if (diffMins < 60)  return diffMins + ' min ago';
  if (diffHours < 24) return diffHours + ' hr' + (diffHours !== 1 ? 's' : '') + ' ago';
  if (diffDays === 1) return 'yesterday';
  return diffDays + ' days ago';
}

/**
 * getGreeting() — "Good morning / afternoon / evening"
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * getDateDisplay() — "Friday, April 4, 2026"
 */
function getDateDisplay() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}


/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS
   ---------------------------------------------------------------- */

// Map of known hostnames → friendly display names.
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'www.github.com':       'GitHub',
  'gist.github.com':      'GitHub Gist',
  'youtube.com':          'YouTube',
  'www.youtube.com':      'YouTube',
  'music.youtube.com':    'YouTube Music',
  'x.com':                'X',
  'www.x.com':            'X',
  'twitter.com':          'X',
  'www.twitter.com':      'X',
  'reddit.com':           'Reddit',
  'www.reddit.com':       'Reddit',
  'old.reddit.com':       'Reddit',
  'substack.com':         'Substack',
  'www.substack.com':     'Substack',
  'medium.com':           'Medium',
  'www.medium.com':       'Medium',
  'linkedin.com':         'LinkedIn',
  'www.linkedin.com':     'LinkedIn',
  'stackoverflow.com':    'Stack Overflow',
  'www.stackoverflow.com':'Stack Overflow',
  'news.ycombinator.com': 'Hacker News',
  'google.com':           'Google',
  'www.google.com':       'Google',
  'mail.google.com':      'Gmail',
  'docs.google.com':      'Google Docs',
  'drive.google.com':     'Google Drive',
  'calendar.google.com':  'Google Calendar',
  'meet.google.com':      'Google Meet',
  'gemini.google.com':    'Gemini',
  'chatgpt.com':          'ChatGPT',
  'www.chatgpt.com':      'ChatGPT',
  'chat.openai.com':      'ChatGPT',
  'claude.ai':            'Claude',
  'www.claude.ai':        'Claude',
  'code.claude.com':      'Claude Code',
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'figma.com':            'Figma',
  'www.figma.com':        'Figma',
  'slack.com':            'Slack',
  'app.slack.com':        'Slack',
  'discord.com':          'Discord',
  'www.discord.com':      'Discord',
  'wikipedia.org':        'Wikipedia',
  'en.wikipedia.org':     'Wikipedia',
  'amazon.com':           'Amazon',
  'www.amazon.com':       'Amazon',
  'netflix.com':          'Netflix',
  'www.netflix.com':      'Netflix',
  'spotify.com':          'Spotify',
  'open.spotify.com':     'Spotify',
  'vercel.com':           'Vercel',
  'www.vercel.com':       'Vercel',
  'npmjs.com':            'npm',
  'www.npmjs.com':        'npm',
  'developer.mozilla.org':'MDN',
  'arxiv.org':            'arXiv',
  'www.arxiv.org':        'arXiv',
  'huggingface.co':       'Hugging Face',
  'www.huggingface.co':   'Hugging Face',
  'producthunt.com':      'Product Hunt',
  'www.producthunt.com':  'Product Hunt',
  'xiaohongshu.com':      'RedNote',
  'www.xiaohongshu.com':  'RedNote',
  'local-files':          'Local Files',
};

function friendlyDomain(hostname) {
  if (!hostname) return '';
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return capitalize(hostname.replace('.substack.com', '')) + "'s Substack";
  }
  if (hostname.endsWith('.github.io')) {
    return capitalize(hostname.replace('.github.io', '')) + ' (GitHub Pages)';
  }

  let clean = hostname
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/, '');

  return clean.split('.').map(part => capitalize(part)).join(' ');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripTitleNoise(title) {
  if (!title) return '';
  // Strip leading notification count: "(2) Title"
  title = title.replace(/^\(\d+\+?\)\s*/, '');
  // Strip inline counts like "Inbox (16,359)"
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  // Strip email addresses (privacy + cleaner display)
  title = title.replace(/\s*[\-\u2010-\u2015]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  // Clean X/Twitter format
  title = title.replace(/\s+on X:\s*/, ': ');
  title = title.replace(/\s*\/\s*X\s*$/, '');
  return title.trim();
}

function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname);
  const domain   = hostname.replace(/^www\./, '');
  const seps     = [' - ', ' | ', ' — ', ' · ', ' – '];

  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix     = title.slice(idx + sep.length).trim();
    const suffixLow  = suffix.toLowerCase();
    if (
      suffixLow === domain.toLowerCase() ||
      suffixLow === friendly.toLowerCase() ||
      suffixLow === domain.replace(/\.\w+$/, '').toLowerCase() ||
      domain.toLowerCase().includes(suffixLow) ||
      friendly.toLowerCase().includes(suffixLow)
    ) {
      const cleaned = title.slice(0, idx).trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return title;
}

function smartTitle(title, url) {
  if (!url) return title || '';
  let pathname = '', hostname = '';
  try { const u = new URL(url); pathname = u.pathname; hostname = u.hostname; }
  catch { return title || ''; }

  const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');

  if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
    const username = pathname.split('/')[1];
    if (username) return titleIsUrl ? `Post by @${username}` : title;
  }

  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull'   && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
    if (titleIsUrl) return 'YouTube Video';
  }

  if ((hostname === 'www.reddit.com' || hostname === 'reddit.com' || hostname === 'old.reddit.com') && pathname.includes('/comments/')) {
    const parts  = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    if (subIdx !== -1 && parts[subIdx + 1]) {
      if (titleIsUrl) return `r/${parts[subIdx + 1]} post`;
    }
  }

  return title || url;
}


/* ----------------------------------------------------------------
   SVG ICON STRINGS
   ---------------------------------------------------------------- */
const ICONS = {
  tabs:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,
  close:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,
  focus:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`,
  move:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 6.75h12m-12 5.25h12m-12 5.25h12M4.5 6.75h.008v.008H4.5V6.75Zm0 5.25h.008v.008H4.5V12Zm0 5.25h.008v.008H4.5v-.008Z" /></svg>`,
  pin:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" aria-hidden="true"><path d="M648.728381 130.779429a73.142857 73.142857 0 0 1 22.674286 15.433142l191.561143 191.756191a73.142857 73.142857 0 0 1-22.137905 118.564571l-67.876572 30.061715-127.341714 127.488-10.093714 140.239238a73.142857 73.142857 0 0 1-124.684191 46.445714l-123.66019-123.782095-210.724572 211.699809-51.833904-51.614476 210.846476-211.821714-127.926857-128.024381a73.142857 73.142857 0 0 1 46.299428-124.635429l144.237715-10.776381 125.074285-125.220571 29.379048-67.779048a73.142857 73.142857 0 0 1 96.207238-38.034285z m-29.086476 67.120761l-34.913524 80.530286-154.087619 154.331429-171.398095 12.751238 303.323428 303.542857 12.044191-167.399619 156.233143-156.428191 80.384-35.59619-191.585524-191.73181z" fill="currentColor" /></svg>`,
};


/* ----------------------------------------------------------------
   IN-MEMORY STORE FOR OPEN-TAB GROUPS
   ---------------------------------------------------------------- */
let domainGroups = [];


/* ----------------------------------------------------------------
   HELPER: filter out browser-internal pages
   ---------------------------------------------------------------- */

/**
 * getRealTabs()
 *
 * Returns tabs that are real web pages — no chrome://, extension
 * pages, about:blank, etc.
 */
function getRealTabs() {
  return openTabs.filter(t => {
    const url = t.url || '';
    return (
      !url.startsWith('chrome://') &&
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('about:') &&
      !url.startsWith('edge://') &&
      !url.startsWith('brave://')
    );
  });
}

/**
 * checkTabOutDupes()
 *
 * Counts how many Tab Harbor pages are open. If more than 1,
 * shows a banner offering to close the extras.
 */
function checkTabOutDupes() {
  const tabOutTabs = openTabs.filter(t => t.isTabOut);
  const banner  = document.getElementById('tabOutDupeBanner');
  const countEl = document.getElementById('tabOutDupeCount');
  if (!banner) return;

  if (tabOutTabs.length > 1) {
    if (countEl) countEl.textContent = tabOutTabs.length;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}


/* ----------------------------------------------------------------
   OVERFLOW CHIPS ("+N more" expand button in domain cards)
   ---------------------------------------------------------------- */

function buildOverflowChips(hiddenTabs, urlCounts = {}) {
  const hiddenChips = hiddenTabs.map(tab => {
    const label    = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count    = urlCounts[tab.url] || 1;
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const iconData = getIconSources(tab, 16);
    const faviconUrl = iconData.sources[0] || '';
    const fallbackUrl = iconData.sources[1] || '';
    const fallbackLabel = getFallbackLabel(label, iconData.hostname);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" aria-label="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" onerror="handleIconError(this, '${fallbackUrl}')">` : ''}
      <span class="chip-favicon chip-favicon-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        ${buildMoveMenu(tab)}
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenTabs.length} more</span>
    </div>`;
}


/* ----------------------------------------------------------------
   DOMAIN CARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderDomainCard(group, groupIndex)
 *
 * Builds the HTML for one domain group card.
 * group = { domain: string, tabs: [{ url, title, id, windowId, active }] }
 */
function renderDomainCard(group) {
  const tabs      = group.tabs || [];
  const tabCount  = tabs.length;
  const isLanding = group.domain === '__landing-pages__';
  const stableId  = getStableGroupId(group.domain);

  // Count duplicates (exact URL match)
  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls   = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes   = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);

  const tabBadge = `<span class="open-tabs-badge">
    ${ICONS.tabs}
    ${tabCount} tab${tabCount !== 1 ? 's' : ''} open
  </span>`;

  const dupeBadge = hasDupes
    ? `<span class="open-tabs-badge is-duplicate">
        ${totalExtras} duplicate${totalExtras !== 1 ? 's' : ''}
      </span>`
    : '';

  // Deduplicate for display: show each URL once, with (Nx) badge if duped
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const orderedTabs = getOrderedUniqueTabsForGroup(group);
  const visibleTabs = orderedTabs.slice(0, 8);
  const extraCount  = orderedTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), group.domain);
    // For localhost tabs, prepend port number so you can tell projects apart
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count    = urlCounts[tab.url];
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const safeSortId = (escapeHtmlAttribute ? escapeHtmlAttribute(tab.url) : tab.url.replace(/"/g, '&quot;'));
    const safeGroupId = (escapeHtmlAttribute ? escapeHtmlAttribute(group.domain) : String(group.domain).replace(/"/g, '&quot;'));
    const iconData = getIconSources(tab, 16);
    const faviconUrl = iconData.sources[0] || '';
    const fallbackUrl = iconData.sources[1] || '';
    const fallbackLabel = getFallbackLabel(label, iconData.hostname);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" data-chip-sort-id="${safeSortId}" data-chip-group-id="${safeGroupId}" aria-label="${safeTitle}">
      <button class="drawer-reorder-handle chip-reorder-handle" type="button" data-chip-drag-handle="tab" aria-label="Drag to reorder tab">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>
      </button>
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" onerror="handleIconError(this, '${fallbackUrl}')">` : ''}
      <span class="chip-favicon chip-favicon-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        ${buildMoveMenu(tab)}
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(orderedTabs.slice(8), urlCounts) : '');

  const closeAllButton = `
    <button class="action-btn close-tabs" data-action="close-domain-tabs" data-domain-id="${stableId}">
      ${ICONS.close}
      Close all ${tabCount} tab${tabCount !== 1 ? 's' : ''}
    </button>`;

  let actionsHtml = '';
  if (hasDupes) {
    const dupeUrlsEncoded = dupeUrls.map(([url]) => encodeURIComponent(url)).join(',');
    actionsHtml += `
      <button class="action-btn" data-action="dedup-keep-one" data-dupe-urls="${dupeUrlsEncoded}">
        Close ${totalExtras} duplicate${totalExtras !== 1 ? 's' : ''}
      </button>`;
  }

  return `
    <div class="mission-card domain-card ${hasDupes ? 'has-amber-bar' : 'has-neutral-bar'}" data-domain-id="${stableId}" data-group-id="${group.domain}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <div class="mission-heading">
            <span class="mission-name">${isLanding ? 'Homepages' : (group.label || friendlyDomain(group.domain))}</span>
            ${tabBadge}
            ${dupeBadge}
          </div>
          ${closeAllButton}
        </div>
        <div class="mission-pages">${pageChips}</div>
        ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">tabs</div>
      </div>
    </div>`;
}

function renderGroupNav(group) {
  const stableId = getStableGroupId(group.domain);
  const isLanding = group.domain === '__landing-pages__';
  const label = isLanding ? 'Homepages' : (group.label || friendlyDomain(group.domain));
  const orderedGroup = {
    ...group,
    tabs: getOrderedUniqueTabsForGroup(group),
  };
  const iconData = getGroupIcon(orderedGroup, label, 32);
  const safeTooltip = escapeHtmlAttribute(label);

  return `
    <button
      class="group-nav-button"
      data-action="jump-to-domain"
      data-group-id="${group.domain}"
      data-domain-id="${stableId}"
      data-tooltip="${safeTooltip}"
      aria-label="Jump to ${label}"
      draggable="false"
    >
      ${iconData.src
        ? `<img class="group-nav-icon" src="${iconData.src}" alt="" draggable="false" onerror="handleIconError(this, '${iconData.fallbackSrc}')">`
        : ''}
      <span class="group-nav-fallback"${iconData.src ? ' style="display:none"' : ''}>${iconData.fallbackLabel}</span>
    </button>`;
}

function renderGroupNavArea(groups) {
  const pinTooltip = groupOrderState.pinEnabled ? 'Pinned order' : 'Pin order';
  return `
    <div class="group-nav-list">
      ${groups.map(group => renderGroupNav(group)).join('')}
    </div>
    <div class="group-nav-tools">
      <button class="header-theme-trigger" id="themeMenuTrigger" data-action="toggle-theme-menu" data-tooltip="Theme" aria-label="Theme" aria-expanded="false" aria-controls="themeMenuPanel">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h15m-12 4.5h9m-6 4.5h3" />
          <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button class="group-pin-toggle ${groupOrderState.pinEnabled ? 'is-active' : ''}" id="headerPinToggle" data-action="toggle-pin-order" data-tooltip="${pinTooltip}" aria-label="${pinTooltip}" aria-pressed="${groupOrderState.pinEnabled}">
        ${ICONS.pin}
      </button>
      <div class="theme-menu" id="themeMenuPanel" hidden>
        <div class="theme-menu-section">
          <div class="theme-menu-label">Theme Color</div>
          <div class="theme-options" id="themeOptions"></div>
        </div>
        <div class="theme-menu-section">
          <div class="theme-menu-label">Background</div>
          <div class="theme-menu-actions">
            <button class="theme-menu-action" data-action="open-background-picker">Upload image</button>
            <button class="theme-menu-action is-secondary" data-action="clear-custom-background">Clear</button>
          </div>
        </div>
        <div class="theme-menu-section">
          <div class="theme-menu-row">
            <div class="theme-menu-label">Transparency</div>
            <div class="theme-range-value" id="themeTransparencyValue">14%</div>
          </div>
          <input
            class="theme-range"
            id="themeTransparencyRange"
            type="range"
            min="8"
            max="60"
            step="1"
            value="14"
          >
        </div>
        <input type="file" id="themeBackgroundInput" accept="image/*" hidden>
      </div>
    </div>`;
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — Render Checklist Column
   ---------------------------------------------------------------- */

/**
 * renderDeferredColumn()
 *
 * Reads saved tabs from chrome.storage.local and renders the right-side
 * "Saved for Later" checklist column. Shows active items as a checklist
 * and completed items in a collapsible archive.
 */
async function renderDeferredColumn() {
  const column         = document.getElementById('drawerColumn');
  const triggerStack   = document.getElementById('drawerTriggerStack');
  const trigger        = document.getElementById('deferredTrigger');
  const todoTrigger    = document.getElementById('todoTrigger');
  const overlay        = document.getElementById('deferredOverlay');
  const list           = document.getElementById('deferredList');
  const empty          = document.getElementById('deferredEmpty');
  const countEl        = document.getElementById('deferredCount');
  const archiveEl      = document.getElementById('deferredArchive');
  const archiveCountEl = document.getElementById('archiveCount');
  const archiveList    = document.getElementById('archiveList');
  const clearArchiveBtn = document.getElementById('clearArchiveBtn');
  const savedPanel = document.getElementById('savedPanel');
  const todoPanel = document.getElementById('todoPanel');
  const savedSearchWrap = document.getElementById('savedSearchWrap');
  const savedSearchInput = document.getElementById('savedSearchInput');
  const titleButtons = document.querySelectorAll('.drawer-title-btn');

  if (!column) return;

  try {
    const { active, archived } = await getSavedTabs();
    const todos = await getTodos();
    const todoBuckets = splitTodos(todos);
    await loadDeferredTriggerPosition();
    column.style.display = 'block';
    if (triggerStack) triggerStack.style.display = 'flex';
    trigger.style.display = 'inline-flex';
    if (todoTrigger) todoTrigger.style.display = 'inline-flex';
    column.classList.toggle('open', deferredPanelOpen);
    column.setAttribute('aria-hidden', String(!deferredPanelOpen));
    trigger.setAttribute('aria-expanded', String(deferredPanelOpen));
    trigger.setAttribute('aria-label', deferredPanelOpen ? 'Close saved for later' : 'Open saved for later');
    if (todoTrigger) {
      todoTrigger.setAttribute('aria-expanded', String(deferredPanelOpen && drawerView === 'todos'));
      todoTrigger.setAttribute('aria-label', deferredPanelOpen && drawerView === 'todos' ? 'Close todos' : 'Open todos');
    }
    overlay.hidden = !deferredPanelOpen;
    overlay.classList.toggle('visible', deferredPanelOpen);
    applyDeferredTriggerPosition();
    savedPanel?.classList.toggle('is-active', drawerView === 'saved');
    todoPanel?.classList.toggle('is-active', drawerView === 'todos');
    titleButtons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.view === drawerView);
    });
    if (savedSearchWrap) savedSearchWrap.style.display = savedSearchOpen && drawerView === 'saved' ? 'block' : 'none';
    if (savedSearchInput && savedSearchInput.value !== savedSearchQuery) savedSearchInput.value = savedSearchQuery;

    const savedNeedle = savedSearchQuery.trim().toLowerCase();
    const filteredActive = !savedNeedle
      ? active
      : active.filter(item =>
          (item.title || '').toLowerCase().includes(savedNeedle) ||
          (item.url || '').toLowerCase().includes(savedNeedle)
        );
    const filteredArchived = !savedNeedle
      ? archived
      : archived.filter(item =>
          (item.title || '').toLowerCase().includes(savedNeedle) ||
          (item.url || '').toLowerCase().includes(savedNeedle)
        );

    // Render active checklist items
    if (filteredActive.length > 0) {
      countEl.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;
      list.innerHTML = filteredActive.map(item => renderDeferredItem(item)).join('');
      list.style.display = 'block';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      countEl.textContent = '';
      empty.style.display = 'block';
    }

    // Render archive section
    if (filteredArchived.length > 0) {
      archiveCountEl.textContent = `(${archived.length})`;
      archiveList.innerHTML = filteredArchived.map(item => renderArchiveItem(item)).join('');
      archiveEl.style.display = 'block';
      if (clearArchiveBtn) clearArchiveBtn.style.display = 'inline-flex';
    } else {
      archiveEl.style.display = 'none';
      if (clearArchiveBtn) clearArchiveBtn.style.display = 'none';
    }

    await renderTodoPanel();

  } catch (err) {
    console.warn('[tab-harbor] Could not load saved tabs:', err);
    column.style.display = 'none';
    if (triggerStack) triggerStack.style.display = 'none';
    trigger.style.display = 'none';
    overlay.hidden = true;
    overlay.classList.remove('visible');
  }
}

function setDeferredPanelOpen(nextOpen) {
  deferredPanelOpen = nextOpen;
  renderDeferredColumn();
}

/**
 * renderDeferredItem(item)
 *
 * Builds HTML for one active checklist item: checkbox, title link,
 * domain, time ago, restore + dismiss buttons.
 */
function renderDeferredItem(item) {
  const iconData = getIconSources(item, 16);
  const domain = iconData.hostname.replace(/^www\./, '');
  const faviconUrl = iconData.sources[0] || '';
  const fallbackUrl = iconData.sources[1] || '';
  const fallbackLabel = getFallbackLabel(item.title || item.url, iconData.hostname);
  const ago = timeAgo(item.savedAt);
  const dragHandle = !savedSearchQuery.trim()
    ? `<button class="drawer-reorder-handle" type="button" data-drag-handle="saved" aria-label="Drag to reorder saved page">
        ${ICONS.move}
      </button>`
    : '';

  return `
    <div class="deferred-item" data-deferred-id="${item.id}" data-drawer-sort-id="${item.id}" data-drawer-sort-kind="saved">
      <input type="checkbox" class="deferred-checkbox" data-action="check-deferred" data-deferred-id="${item.id}">
      <div class="deferred-info">
        <a href="${item.url}" target="_blank" rel="noopener" class="deferred-title" title="${(item.title || '').replace(/"/g, '&quot;')}">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" onerror="handleIconError(this, '${fallbackUrl}')">` : ''}
          <span class="inline-favicon-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>${item.title || item.url}
        </a>
        <div class="deferred-meta">
          <span>${domain}</span>
          <span>${ago}</span>
        </div>
      </div>
      <div class="deferred-actions">
        <button class="deferred-action-btn deferred-restore" data-action="restore-deferred" data-deferred-id="${item.id}" title="Restore">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </button>
        <button class="deferred-action-btn deferred-dismiss" data-action="dismiss-deferred" data-deferred-id="${item.id}" title="Dismiss">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
        ${dragHandle}
      </div>
    </div>`;
}

/**
 * renderArchiveItem(item)
 *
 * Builds HTML for one completed/archived item (simpler: just title + date).
 */
function renderArchiveItem(item) {
  const ago = item.completedAt ? timeAgo(item.completedAt) : timeAgo(item.savedAt);
  return `
    <div class="archive-item">
      <div class="archive-item-main">
        <a href="${item.url}" target="_blank" rel="noopener" class="archive-item-title" title="${(item.title || '').replace(/"/g, '&quot;')}">
          ${item.title || item.url}
        </a>
        <span class="archive-item-date">${ago}</span>
      </div>
      <button class="archive-item-delete" data-action="delete-archive-item" data-archive-id="${item.id}" title="Delete from archive">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}


/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 *
 * The main render function:
 * 1. Paints greeting + date
 * 2. Fetches open tabs via chrome.tabs.query()
 * 3. Groups tabs by domain (with landing pages pulled out to their own group)
 * 4. Renders domain cards
 * 5. Updates footer stats
 * 6. Renders the "Saved for Later" checklist
 */
async function renderStaticDashboard() {
  // --- Header ---
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('dateDisplay');
  if (greetingEl) greetingEl.textContent = getGreeting();
  if (dateEl)     dateEl.textContent     = getDateDisplay();
  renderThemeMenu();
  await renderQuickShortcuts();

  // --- Fetch tabs ---
  await fetchOpenTabs();
  const realTabs = getRealTabs();
  await loadSessionGroups(realTabs.map(tab => tab.id));
  await loadGroupOrder();

  // --- Group tabs by domain ---
  // Landing pages (Gmail inbox, Twitter home, etc.) get their own special group
  // so they can be closed together without affecting content tabs on the same domain.
  const LANDING_PAGE_PATTERNS = [
    { hostname: 'mail.google.com', test: (p, h) =>
        !h.includes('#inbox/') && !h.includes('#sent/') && !h.includes('#search/') },
    { hostname: 'x.com',               pathExact: ['/home'] },
    { hostname: 'www.linkedin.com',    pathExact: ['/'] },
    { hostname: 'github.com',          pathExact: ['/'] },
    { hostname: 'www.youtube.com',     pathExact: ['/'] },
    // Merge personal patterns from config.local.js (if it exists)
    ...(typeof LOCAL_LANDING_PAGE_PATTERNS !== 'undefined' ? LOCAL_LANDING_PAGE_PATTERNS : []),
  ];

  function isLandingPage(url) {
    try {
      const parsed = new URL(url);
      return LANDING_PAGE_PATTERNS.some(p => {
        // Support both exact hostname and suffix matching (for wildcard subdomains)
        const hostnameMatch = p.hostname
          ? parsed.hostname === p.hostname
          : p.hostnameEndsWith
            ? parsed.hostname.endsWith(p.hostnameEndsWith)
            : false;
        if (!hostnameMatch) return false;
        if (p.test)       return p.test(parsed.pathname, url);
        if (p.pathPrefix) return parsed.pathname.startsWith(p.pathPrefix);
        if (p.pathExact)  return p.pathExact.includes(parsed.pathname);
        return parsed.pathname === '/';
      });
    } catch { return false; }
  }

  domainGroups = [];
  const manualGroupMap = Object.fromEntries(
    sessionGroupsState.groups.map(group => [
      group.id,
      {
        domain: `__session_group__:${group.id}`,
        label: group.name,
        tabs: [],
        isManual: true,
        manualGroupId: group.id,
        createdAt: group.createdAt,
      },
    ])
  );
  const groupMap    = {};
  const landingTabs = [];

  // Custom group rules from config.local.js (if any)
  const customGroups = typeof LOCAL_CUSTOM_GROUPS !== 'undefined' ? LOCAL_CUSTOM_GROUPS : [];

  // Check if a URL matches a custom group rule; returns the rule or null
  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return customGroups.find(r => {
        const hostMatch = r.hostname
          ? parsed.hostname === r.hostname
          : r.hostnameEndsWith
            ? parsed.hostname.endsWith(r.hostnameEndsWith)
            : false;
        if (!hostMatch) return false;
        if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
        return true; // hostname matched, no path filter
      }) || null;
    } catch { return null; }
  }

  for (const tab of realTabs) {
    try {
      const assignedGroupId = sessionGroupsState.assignments[String(tab.id)];
      if (assignedGroupId && manualGroupMap[assignedGroupId]) {
        manualGroupMap[assignedGroupId].tabs.push({
          ...tab,
          manualGroupId: assignedGroupId,
        });
        continue;
      }

      if (isLandingPage(tab.url)) {
        landingTabs.push(tab);
        continue;
      }

      // Check custom group rules first (e.g. merge subdomains, split by path)
      const customRule = matchCustomGroup(tab.url);
      if (customRule) {
        const key = customRule.groupKey;
        if (!groupMap[key]) groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
        groupMap[key].tabs.push(tab);
        continue;
      }

      let hostname;
      if (tab.url && tab.url.startsWith('file://')) {
        hostname = 'local-files';
      } else {
        hostname = new URL(tab.url).hostname;
      }
      if (!hostname) continue;

      if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
      groupMap[hostname].tabs.push(tab);
    } catch {
      // Skip malformed URLs
    }
  }

  if (landingTabs.length > 0) {
    groupMap['__landing-pages__'] = { domain: '__landing-pages__', tabs: landingTabs };
  }

  // Sort: landing pages first, then domains from landing page sites, then by tab count
  // Collect exact hostnames and suffix patterns for priority sorting
  const landingHostnames = new Set(LANDING_PAGE_PATTERNS.map(p => p.hostname).filter(Boolean));
  const landingSuffixes = LANDING_PAGE_PATTERNS.map(p => p.hostnameEndsWith).filter(Boolean);
  function isLandingDomain(domain) {
    if (landingHostnames.has(domain)) return true;
    return landingSuffixes.some(s => domain.endsWith(s));
  }
  const manualGroups = Object.values(manualGroupMap)
    .filter(group => group.tabs.length > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const automaticGroups = Object.values(groupMap).sort((a, b) => {
    const aIsLanding = a.domain === '__landing-pages__';
    const bIsLanding = b.domain === '__landing-pages__';
    if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

    const aIsPriority = isLandingDomain(a.domain);
    const bIsPriority = isLandingDomain(b.domain);
    if (aIsPriority !== bIsPriority) return aIsPriority ? -1 : 1;

    return b.tabs.length - a.tabs.length;
  });
  domainGroups = applyGroupOrder([...manualGroups, ...automaticGroups], groupOrderState);
  await loadGroupTabOrder(domainGroups);

  // --- Render domain cards ---
  const openTabsSection      = document.getElementById('openTabsSection');
  const openTabsMissionsEl   = document.getElementById('openTabsMissions');
  const openTabsSectionCount = document.getElementById('openTabsSectionCount');
  const openTabsSectionTitle = document.getElementById('openTabsSectionTitle');
  const openTabsGroupNav     = document.getElementById('openTabsGroupNav');

  if (domainGroups.length > 0 && openTabsSection) {
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = 'Open tabs';
    openTabsSectionCount.innerHTML = `${domainGroups.length} group${domainGroups.length !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; <button class="action-btn close-tabs" data-action="close-all-open-tabs" style="font-size:11px;padding:3px 10px;">${ICONS.close} Close all ${realTabs.length} tabs</button>`;
    openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g)).join('');
    if (openTabsGroupNav) {
      openTabsGroupNav.innerHTML = renderGroupNavArea(domainGroups);
      openTabsGroupNav.style.display = 'flex';
    }
    openTabsSection.style.display = 'block';
  } else if (openTabsSection) {
    if (openTabsGroupNav) {
      openTabsGroupNav.innerHTML = '';
      openTabsGroupNav.style.display = 'none';
    }
    openTabsSection.style.display = 'none';
  }

  // --- Footer stats ---
  const statTabs = document.getElementById('statTabs');
  if (statTabs) statTabs.textContent = openTabs.length;

  // --- Check for duplicate Tab Harbor tabs ---
  checkTabOutDupes();

  // --- Render "Saved for Later" column ---
  await renderDeferredColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
}

function handleIconError(imgEl, fallbackUrl) {
  if (!imgEl) return;

  if (fallbackUrl && imgEl.dataset.fallbackApplied !== 'true') {
    imgEl.dataset.fallbackApplied = 'true';
    imgEl.src = fallbackUrl;
    return;
  }

  imgEl.style.display = 'none';
  const sibling = imgEl.nextElementSibling;
  if (sibling && (
    sibling.classList.contains('group-nav-fallback') ||
    sibling.classList.contains('chip-favicon-fallback') ||
    sibling.classList.contains('inline-favicon-fallback') ||
    sibling.classList.contains('quick-shortcut-fallback')
  )) {
    sibling.style.display = sibling.classList.contains('inline-favicon-fallback') ? 'inline-flex' : 'flex';
  }
}

function updateBackToTopVisibility() {
  const button = document.getElementById('backToTopBtn');
  if (!button) return;
  const shouldShow = window.scrollY > 320;
  button.classList.toggle('visible', shouldShow);
}


/* ----------------------------------------------------------------
   EVENT HANDLERS — using event delegation

   One listener on document handles ALL button clicks.
   Think of it as one security guard watching the whole building
   instead of one per door.
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  if (e.target.closest('.chip-reorder-handle')) return;
  // Walk up the DOM to find the nearest element with data-action
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'toggle-theme-menu') {
    themeMenuOpen = !themeMenuOpen;
    renderThemeMenu();
    return;
  }

  if (action === 'select-theme') {
    const themeId = actionEl.dataset.themeId || 'paper';
    await saveThemePreferences({ themeId });
    themeMenuOpen = false;
    renderThemeMenu();
    showToast('Theme updated');
    return;
  }

  if (action === 'open-background-picker') {
    document.getElementById('themeBackgroundInput')?.click();
    return;
  }

  if (action === 'clear-custom-background') {
    await saveThemePreferences({ customBackground: '' });
    themeMenuOpen = false;
    renderThemeMenu();
    showToast('Background cleared');
    return;
  }

  if (action === 'add-quick-shortcut') {
    const rawUrl = window.prompt('Shortcut URL');
    if (!rawUrl || !rawUrl.trim()) return;

    const url = normalizeShortcutUrl(rawUrl);
    if (!url) {
      showToast('Invalid URL');
      return;
    }

    const label = (window.prompt('Shortcut label (optional)') || '').trim();
    const shortcuts = await getQuickShortcuts();
    await saveQuickShortcuts([
      ...shortcuts,
      {
        id: `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        label,
      },
    ]);
    await renderQuickShortcuts();
    showToast('Quick tab added');
    return;
  }

  if (action === 'remove-quick-shortcut') {
    e.stopPropagation();
    const shortcutId = actionEl.dataset.shortcutId;
    if (!shortcutId) return;
    const shortcuts = await getQuickShortcuts();
    await saveQuickShortcuts(shortcuts.filter(item => item.id !== shortcutId));
    await renderQuickShortcuts();
    showToast('Quick tab removed');
    return;
  }

  if (action === 'open-quick-shortcut') {
    const url = actionEl.dataset.shortcutUrl;
    if (!url) return;
    await openOrFocusUrl(url);
    return;
  }

  // ---- Close duplicate Tab Harbor tabs ----
  if (action === 'close-tabout-dupes') {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById('tabOutDupeBanner');
    if (banner) {
      banner.style.transition = 'opacity 0.4s';
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; banner.style.opacity = '1'; }, 400);
    }
    showToast('Closed extra Tab Harbor tabs');
    return;
  }

  const card = actionEl.closest('.mission-card');

  // ---- Open/close the Move to group menu ----
  if (action === 'toggle-move-menu') {
    e.stopPropagation();
    const menu = actionEl.closest('.chip-move-wrap')?.querySelector('.chip-move-menu');
    const shouldOpen = Boolean(menu?.hidden);
    closeMoveMenus();
    if (menu && shouldOpen) {
      menu.hidden = false;
      actionEl.classList.add('is-open');
    }
    return;
  }

  // ---- Move a tab into an existing manual group ----
  if (action === 'move-tab-to-group') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    const groupId = actionEl.dataset.groupId;
    const group = sessionGroupsState.groups.find(item => item.id === groupId);
    if (!tabId || !groupId || !group) return;

    const nextState = assignTabToSessionGroup(sessionGroupsState, tabId, groupId);
    await saveSessionGroups(nextState);
    closeMoveMenus();
    await renderDashboard();
    showToast(`Moved to ${group.name}`);
    return;
  }

  // ---- Create a new manual group and move this tab into it ----
  if (action === 'move-tab-to-new-group') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    if (!tabId) return;

    const nextName = window.prompt('New group name');
    if (!nextName || !nextName.trim()) {
      closeMoveMenus();
      return;
    }

    try {
      const created = addSessionGroup(sessionGroupsState, nextName);
      const nextState = assignTabToSessionGroup(created.state, tabId, created.group.id);
      await saveSessionGroups(nextState);
      closeMoveMenus();
      await renderDashboard();
      showToast(`Created ${created.group.name}`);
    } catch (err) {
      showToast(err.message || 'Could not create group');
    }
    return;
  }

  // ---- Move a tab back to its original automatic group ----
  if (action === 'move-tab-to-original') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    if (!tabId) return;

    const nextState = pruneSessionGroups(
      clearTabSessionGroup(sessionGroupsState, tabId),
      openTabs.map(tab => tab.id)
    );
    await saveSessionGroups(nextState);
    closeMoveMenus();
    await renderDashboard();
    showToast('Moved back to original group');
    return;
  }

  // ---- Expand overflow chips ("+N more") ----
  if (action === 'expand-chips') {
    const overflowContainer = actionEl.parentElement.querySelector('.page-chips-overflow');
    if (overflowContainer) {
      overflowContainer.style.display = 'contents';
      actionEl.remove();
    }
    return;
  }

  // ---- Focus a specific tab ----
  if (action === 'focus-tab') {
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  // ---- Jump to a domain group card from the top icon nav ----
  if (action === 'toggle-pin-order') {
    e.stopPropagation();
    const nextState = setPinEnabled(
      groupOrderState,
      !groupOrderState.pinEnabled,
      domainGroups.map(group => group.domain)
    );
    await saveGroupOrder(nextState);
    await renderDashboard();
    showToast(nextState.pinEnabled ? 'Pinned current order' : 'Pin order turned off');
    return;
  }

  if (action === 'jump-to-domain') {
    if (Date.now() < suppressJumpUntil) return;
    const domainId = actionEl.dataset.domainId;
    if (!domainId) return;
    const target = document.querySelector(`.mission-card[data-domain-id="${domainId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('group-nav-target');
    setTimeout(() => target.classList.remove('group-nav-target'), 1200);
    return;
  }

  // ---- Close a single tab ----
  if (action === 'close-single-tab') {
    e.stopPropagation(); // don't trigger parent chip's focus-tab
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    // Close the tab in Chrome directly
    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();
    await loadSessionGroups(openTabs.map(tab => tab.id));

    playCloseSound();

    // Animate the chip row out
    const chip = actionEl.closest('.page-chip');
    if (chip) {
      const rect = chip.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => {
        chip.remove();
        // If the card now has no tabs, remove it too
        const parentCard = document.querySelector('.mission-card:has(.mission-pages:empty)');
        if (parentCard) animateCardOut(parentCard);
        document.querySelectorAll('.mission-card').forEach(c => {
          if (c.querySelectorAll('.page-chip[data-action="focus-tab"]').length === 0) {
            animateCardOut(c);
          }
        });
      }, 200);
    }

    // Update footer
    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;

    showToast('Tab closed');
    return;
  }

  // ---- Save a single tab for later (then close it) ----
  if (action === 'defer-single-tab') {
    e.stopPropagation();
    const tabUrl   = actionEl.dataset.tabUrl;
    const tabTitle = actionEl.dataset.tabTitle || tabUrl;
    if (!tabUrl) return;

    // Save to chrome.storage.local
    try {
      await saveTabForLater({ url: tabUrl, title: tabTitle });
    } catch (err) {
      console.error('[tab-harbor] Failed to save tab:', err);
      showToast('Failed to save tab');
      return;
    }

    // Close the tab in Chrome
    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();
    await loadSessionGroups(openTabs.map(tab => tab.id));

    // Animate chip out
    const chip = actionEl.closest('.page-chip');
    if (chip) {
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => chip.remove(), 200);
    }

    showToast('Saved for later');
    await renderDeferredColumn();
    return;
  }

  // ---- Check off a saved tab (moves it to archive) ----
  if (action === 'check-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await checkOffSavedTab(id);

    // Animate: strikethrough first, then slide out
    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('checked');
      setTimeout(() => {
        item.classList.add('removing');
        setTimeout(() => {
          item.remove();
          renderDeferredColumn(); // refresh counts and archive
        }, 300);
      }, 800);
    }
    return;
  }

  // ---- Dismiss a saved tab (removes it entirely) ----
  if (action === 'dismiss-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await dismissSavedTab(id);

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
        renderDeferredColumn();
      }, 300);
    }
    return;
  }

  // ---- Restore an active saved tab back to normal (remove from saved) ----
  if (action === 'restore-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    const restored = await restoreSavedTab(id);
    if (!restored?.url) return;

    await reopenSavedTab(restored.url);
    await renderDashboard();

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
      }, 300);
    }

    showToast('Restored to open tabs');
    return;
  }

  // ---- Delete a single archived item ----
  if (action === 'delete-archive-item') {
    const id = actionEl.dataset.archiveId;
    if (!id) return;

    await deleteArchivedTab(id);
    await renderDeferredColumn();
    showToast('Removed from archive');
    return;
  }

  // ---- Clear all archived items ----
  if (action === 'clear-archive') {
    await clearArchivedTabs();
    await renderDeferredColumn();
    showToast('Archive cleared');
    return;
  }

  // ---- Close all tabs in a domain group ----
  if (action === 'close-domain-tabs') {
    const domainId = actionEl.dataset.domainId;
    const group    = domainGroups.find(g => {
      return 'domain-' + g.domain.replace(/[^a-z0-9]/g, '-') === domainId;
    });
    if (!group) return;

    const urls      = group.tabs.map(t => t.url);
    // Landing pages and custom groups (whose domain key isn't a real hostname)
    // must use exact URL matching to avoid closing unrelated tabs
    const useExact  = group.domain === '__landing-pages__' || !!group.label;

    if (useExact) {
      await closeTabsExact(urls);
    } else {
      await closeTabsByUrls(urls);
    }

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    // Remove from in-memory groups
    const idx = domainGroups.indexOf(group);
    if (idx !== -1) domainGroups.splice(idx, 1);

    const groupLabel = group.domain === '__landing-pages__' ? 'Homepages' : (group.label || friendlyDomain(group.domain));
    showToast(`Closed ${urls.length} tab${urls.length !== 1 ? 's' : ''} from ${groupLabel}`);

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;
    return;
  }

  // ---- Close duplicates, keep one copy ----
  if (action === 'dedup-keep-one') {
    const urlsEncoded = actionEl.dataset.dupeUrls || '';
    const urls = urlsEncoded.split(',').map(u => decodeURIComponent(u)).filter(Boolean);
    if (urls.length === 0) return;

    await closeDuplicateTabs(urls, true);
    playCloseSound();

    // Hide the dedup button
    actionEl.style.transition = 'opacity 0.2s';
    actionEl.style.opacity    = '0';
    setTimeout(() => actionEl.remove(), 200);

    // Remove dupe badges from the card
    if (card) {
      card.querySelectorAll('.chip-dupe-badge').forEach(b => {
        b.style.transition = 'opacity 0.2s';
        b.style.opacity    = '0';
        setTimeout(() => b.remove(), 200);
      });
      card.querySelectorAll('.open-tabs-badge').forEach(badge => {
        if (badge.textContent.includes('duplicate')) {
          badge.style.transition = 'opacity 0.2s';
          badge.style.opacity    = '0';
          setTimeout(() => badge.remove(), 200);
        }
      });
      card.classList.remove('has-amber-bar');
      card.classList.add('has-neutral-bar');
    }

    showToast('Closed duplicates, kept one copy each');
    return;
  }

  // ---- Close ALL open tabs ----
  if (action === 'close-all-open-tabs') {
    const allUrls = openTabs
      .filter(t => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('about:'))
      .map(t => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();

    document.querySelectorAll('#openTabsMissions .mission-card').forEach(c => {
      shootConfetti(
        c.getBoundingClientRect().left + c.offsetWidth / 2,
        c.getBoundingClientRect().top  + c.offsetHeight / 2
      );
      animateCardOut(c);
    });

    showToast('All tabs closed. Fresh start.');
    return;
  }
});

document.addEventListener('click', (e) => {
  const themeControls = document.getElementById('themeControls');
  if (themeMenuOpen && themeControls && !themeControls.contains(e.target)) {
    themeMenuOpen = false;
    renderThemeMenu();
  }

  if (e.target.closest('.chip-move-wrap')) return;
  closeMoveMenus();
});

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('#deferredTrigger');
  if (trigger) {
    if (Date.now() < deferredTriggerSuppressClickUntil) return;
    const nextOpen = !(deferredPanelOpen && drawerView === 'saved');
    drawerView = 'saved';
    setDeferredPanelOpen(nextOpen);
    return;
  }

  const todoTrigger = e.target.closest('#todoTrigger');
  if (todoTrigger) {
    if (Date.now() < deferredTriggerSuppressClickUntil) return;
    const nextOpen = !(deferredPanelOpen && drawerView === 'todos');
    drawerView = 'todos';
    setDeferredPanelOpen(nextOpen);
    return;
  }

  if (e.target.closest('#deferredCloseBtn') || e.target.closest('#deferredOverlay')) {
    setDeferredPanelOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && themeMenuOpen) {
    themeMenuOpen = false;
    renderThemeMenu();
    return;
  }

  if (e.key === 'Escape' && deferredPanelOpen) {
    setDeferredPanelOpen(false);
  }
});

document.addEventListener('pointerdown', (e) => {
  const trigger = e.target.closest('.deferred-trigger');
  const triggerStack = document.getElementById('drawerTriggerStack');
  if (!trigger || !triggerStack || isMobileDeferredLayout() || e.button !== 0) return;

  const rect = triggerStack.getBoundingClientRect();
  deferredTriggerDragState = {
    startY: e.clientY,
    offsetY: e.clientY - rect.top,
    moved: false,
  };
});

document.addEventListener('pointermove', (e) => {
  if (!deferredTriggerDragState || isMobileDeferredLayout()) return;

  const triggerStack = document.getElementById('drawerTriggerStack');
  if (!triggerStack) return;

  const distance = Math.abs(e.clientY - deferredTriggerDragState.startY);
  if (!deferredTriggerDragState.moved && distance < 6) return;

  deferredTriggerDragState.moved = true;
  const nextTop = clampTriggerTop(
    e.clientY - deferredTriggerDragState.offsetY,
    window.innerHeight,
    triggerStack.offsetHeight || 96,
    24
  );
  if (nextTop == null) return;

  deferredTriggerPosition = { top: nextTop };
  triggerStack.style.top = `${nextTop}px`;
});

document.addEventListener('pointerup', async () => {
  if (!deferredTriggerDragState) return;

  if (deferredTriggerDragState.moved) {
    await saveDeferredTriggerPosition(deferredTriggerPosition);
    deferredTriggerSuppressClickUntil = Date.now() + 250;
  }

  deferredTriggerDragState = null;
});

document.addEventListener('click', (e) => {
  const backToTopBtn = e.target.closest('#backToTopBtn');
  if (!backToTopBtn) return;

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });
});

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'switch-drawer-view') {
    drawerView = actionEl.dataset.view || 'saved';
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'toggle-saved-search') {
    savedSearchOpen = !savedSearchOpen;
    if (!savedSearchOpen) savedSearchQuery = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'toggle-todo-search') {
    todoSearchOpen = !todoSearchOpen;
    if (!todoSearchOpen) todoSearchQuery = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'create-todo') {
    const title = window.prompt('Todo title');
    if (!title || !title.trim()) return;
    const description = window.prompt('Todo details (optional)') || '';
    await createTodoItem({ title, description });
    drawerView = 'todos';
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'open-todo-detail') {
    todoDetailId = actionEl.dataset.todoId || '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'close-todo-detail') {
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'complete-todo') {
    const id = actionEl.dataset.todoId;
    if (!id) return;
    await completeTodoItem(id);
    if (todoDetailId === id) todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'delete-todo-archive') {
    const id = actionEl.dataset.todoId;
    if (!id) return;
    await deleteTodoItem(id);
    await renderDeferredColumn();
    return;
  }

  if (action === 'clear-todo-archive') {
    await clearTodoArchiveItems();
    await renderDeferredColumn();
    return;
  }

  if (action === 'close-drawer') {
    setDeferredPanelOpen(false);
    return;
  }
});

document.addEventListener('pointerdown', (e) => {
  const chipHandle = e.target.closest('[data-chip-drag-handle="tab"]');
  if (chipHandle && e.button === 0) {
    const item = chipHandle.closest('[data-chip-sort-id]');
    const listEl = item?.parentElement;
    const groupKey = item?.dataset.chipGroupId || '';
    if (!item || !listEl || !groupKey) return;

    e.preventDefault();
    draggedPageChipId = item.dataset.chipSortId || '';
    draggedPageChipEl = item;

    const rect = item.getBoundingClientRect();
    pageChipDragState = {
      groupKey,
      listEl,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    };
    return;
  }

  const drawerHandle = e.target.closest('.drawer-reorder-handle');
  if (!drawerHandle || e.button !== 0) return;

  const item = drawerHandle.closest('[data-drawer-sort-id]');
  const listEl = item?.parentElement;
  const kind = item?.dataset.drawerSortKind || '';
  if (!item || !listEl || !kind) return;

  e.preventDefault();
  draggedDrawerItemId = item.dataset.drawerSortId || '';
  draggedDrawerItemEl = item;

  const rect = item.getBoundingClientRect();
  drawerItemDragState = {
    kind,
    listEl,
    x: e.clientX,
    y: e.clientY,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    moved: false,
  };
});

document.addEventListener('pointermove', (e) => {
  if (draggedPageChipId && pageChipDragState) {
    const distance = Math.hypot(e.clientX - pageChipDragState.x, e.clientY - pageChipDragState.y);
    if (!pageChipDragState.moved && distance >= 4) {
      pageChipDragState.moved = true;
      document.body.classList.add('page-chip-list-dragging');
      draggedPageChipEl?.classList.add('is-dragging');
      draggedPageChipEl?.style.setProperty('--drag-width', `${draggedPageChipEl.getBoundingClientRect().width}px`);
      ensurePageChipPlaceholder();
    }

    if (pageChipDragState.moved) {
      updateDraggedPageChipPosition(e.clientX, e.clientY);
      previewPageChipOrder(e.clientY);
    }
    return;
  }

  if (!draggedDrawerItemId || !drawerItemDragState) return;

  const distance = Math.hypot(e.clientX - drawerItemDragState.x, e.clientY - drawerItemDragState.y);
  if (!drawerItemDragState.moved && distance < 4) return;

  if (!drawerItemDragState.moved) {
    drawerItemDragState.moved = true;
    document.body.classList.add('drawer-list-dragging');
    draggedDrawerItemEl?.classList.add('is-dragging');
    draggedDrawerItemEl?.style.setProperty('--drag-width', `${draggedDrawerItemEl.getBoundingClientRect().width}px`);
    ensureDrawerItemPlaceholder();
  }

  updateDraggedDrawerItemPosition(e.clientX, e.clientY);
  previewDrawerItemOrder(e.clientY);
});

document.addEventListener('pointerup', async () => {
  if (draggedPageChipId && pageChipDragState) {
    const moved = pageChipDragState.moved;
    const draggedGroupKey = pageChipDragState.groupKey;
    if (moved) {
      const orderUrls = [...pageChipDragState.listEl.children]
        .map(node => {
          if (node === pageChipPlaceholderEl) return draggedPageChipId;
          if (node === draggedPageChipEl) return '';
          return node.dataset?.chipSortId || '';
        })
        .filter(Boolean);

      await saveGroupTabRowOrder(pageChipDragState.groupKey, orderUrls);
      if (draggedPageChipEl && pageChipPlaceholderEl) {
        pageChipDragState.listEl.insertBefore(draggedPageChipEl, pageChipPlaceholderEl);
      }
    }

    clearPageChipDragState();

    if (moved) {
      updateGroupNavButtonIcon(draggedGroupKey);
    }
    return;
  }

  if (!draggedDrawerItemId || !drawerItemDragState) return;

  const moved = drawerItemDragState.moved;
  if (moved) {
    const orderIds = [...drawerItemDragState.listEl.children]
      .map(node => {
        if (node === drawerItemPlaceholderEl) return draggedDrawerItemId;
        return node.dataset?.drawerSortId || '';
      })
      .filter(Boolean);

    await saveDrawerItemOrder(drawerItemDragState.kind, orderIds);
  }

  const draggedKind = drawerItemDragState.kind;
  clearDrawerItemDragState();

  if (moved) {
    if (draggedKind === 'saved') {
      await renderDeferredColumn();
    } else if (draggedKind === 'todo') {
      await renderTodoPanel();
    }
  }
});

document.addEventListener('pointerdown', (e) => {
  const button = e.target.closest('.group-nav-button');
  if (!button) return;

  draggedGroupId = button.dataset.groupId || '';
  draggedGroupButtonEl = button;
  const rect = button.getBoundingClientRect();
  dragStartPoint = {
    x: e.clientX,
    y: e.clientY,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    moved: false,
    lastTargetId: draggedGroupId,
  };
});

document.addEventListener('pointermove', (e) => {
  if (!draggedGroupId || !dragStartPoint) return;

  const distance = Math.hypot(e.clientX - dragStartPoint.x, e.clientY - dragStartPoint.y);
  if (!dragStartPoint.moved && distance < 2) return;

  if (!dragStartPoint.moved) {
    dragStartPoint.moved = true;
    document.body.classList.add('group-dragging');
    draggedGroupButtonEl?.classList.add('is-dragging');
    ensureDragPlaceholder();
  }

  updateDraggedButtonPosition(e.clientX, e.clientY);
  previewDraggedOrder(e.clientX);
});

document.addEventListener('pointerup', async () => {
  if (!draggedGroupId) return;

  const moved = dragStartPoint?.moved;
  if (dragStartPoint?.moved) {
    await saveGroupOrder(groupOrderState);
    suppressJumpUntil = Date.now() + 250;
  }

  clearGroupDragState();

  if (moved) {
    await renderDashboard();
  }
});

// ---- Archive toggle — expand/collapse the archive section ----
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#archiveToggle');
  if (!toggle) return;

  toggle.classList.toggle('open');
  const body = document.getElementById('archiveBody');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
});

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#todoArchiveToggle');
  if (!toggle) return;

  toggle.classList.toggle('open');
  const body = document.getElementById('todoArchiveBody');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
});

// ---- Archive search — filter archived items as user types ----
document.addEventListener('input', async (e) => {
  if (e.target.id === 'themeTransparencyRange') {
    themePreferences = normalizeThemePreferences({
      ...themePreferences,
      surfaceOpacity: Number(e.target.value),
    });
    applyThemePreferences();
    const valueEl = document.getElementById('themeTransparencyValue');
    if (valueEl) valueEl.textContent = `${themePreferences.surfaceOpacity}%`;
    await chrome.storage.local.set({ [THEME_PREFERENCES_KEY]: themePreferences });
    return;
  }

  if (e.target.id !== 'savedSearchInput') return;
  savedSearchQuery = e.target.value.trim();
  await renderDeferredColumn();
});

document.addEventListener('input', async (e) => {
  if (e.target.id !== 'todoSearchInput') return;
  todoSearchQuery = e.target.value.trim();
  await renderDeferredColumn();
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'themeBackgroundInput') return;

  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    const customBackground = await readFileAsDataUrl(file);
    await saveThemePreferences({ customBackground });
    themeMenuOpen = false;
    renderThemeMenu();
    showToast('Background updated');
  } catch (err) {
    showToast(err?.message || 'Could not load background');
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'headerSearchForm') return;

  e.preventDefault();
  const input = document.getElementById('headerSearchInput');
  const query = input?.value || '';
  await runDefaultSearch(query);
});


/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
async function initializeApp() {
  await loadThemePreferences();
  await renderDashboard();
  updateBackToTopVisibility();
}

window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
initializeApp();
