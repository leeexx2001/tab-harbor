'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('move menu keeps hidden state until explicitly opened', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.chip-move-menu\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/
  );
});

test('mission card allows move menu to overflow outside the card', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.mission-card\s*\{[\s\S]*overflow:\s*visible;/
  );
});

test('mission card is raised above sibling cards while move menu is open', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.mission-card:has\(\.chip-move-trigger\.is-open\)\s*\{[\s\S]*z-index:\s*40;/
  );
});

test('dragging uses the original group icon as a fixed positioned element', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.group-nav-button\.is-dragging\s*\{[\s\S]*position:\s*fixed;[\s\S]*pointer-events:\s*none;/
  );
});

test('pin button icon is rotated to point its head toward the right', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.match(
    css,
    /\.group-pin-toggle svg\s*\{[\s\S]*transform:\s*none;/
  );
  assert.match(css, /\.group-pin-toggle\s*\{[\s\S]*border:\s*none;/);
  assert.match(appJs, /pin:\s+`<svg[^`]*viewBox="0 0 1024 1024"[^`]*fill="none"/);
  assert.match(appJs, /M648\.728381 130\.779429a73\.142857 73\.142857/);
});

test('group nav icons disable native image dragging', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(appJs, /class="group-nav-button"[\s\S]*draggable="false"/);
  assert.match(appJs, /class="group-nav-icon"[\s\S]*draggable="false"/);
  assert.match(css, /\.group-nav-button,\s*\.group-nav-button \*\s*\{[\s\S]*-webkit-user-drag:\s*none;/);
});

test('index includes a back-to-top floating button', () => {
  assert.match(html, /id="backToTopBtn"/);
});

test('index includes deferred drawer trigger and overlay', () => {
  assert.match(html, /id="deferredTrigger"/);
  assert.match(html, /id="todoTrigger"/);
  assert.match(html, /id="deferredOverlay"/);
  assert.match(html, /id="headerSearchForm"/);
  assert.match(html, /id="headerSearchInput"/);
  assert.match(html, /class="header-title-row"/);
  assert.match(html, /id="quickTabsSection"/);
  assert.match(html, /id="quickTabsList"/);
  assert.doesNotMatch(html, /Quick tabs/);
  assert.doesNotMatch(html, /No custom background/);
  assert.doesNotMatch(html, /deferredTriggerIconPath/);
  assert.doesNotMatch(html, /id="deferredTriggerCount"/);
  assert.doesNotMatch(html, /deferred-trigger-label/);
});

test('footer credits point to the repo and OO GitHub profile', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    html,
    /class="footer-credit"[\s\S]*href="https:\/\/github\.com\/V-IOLE-T\/tab-harbor"[\s\S]*>Tab Harbor<\/a> by <a class="footer-credit-link" href="https:\/\/github\.com\/V-IOLE-T"[\s\S]*>OO<\/a>/
  );
  assert.match(css, /\.footer-credit-link\s*\{/);
  assert.match(css, /\.footer-credit-link:hover,\s*\.footer-credit-link:focus-visible\s*\{/);
});

test('group nav reorder animation uses FLIP-style transition for sibling icons', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.match(appJs, /getBoundingClientRect\(\)/);
  assert.match(appJs, /requestAnimationFrame/);
  assert.match(appJs, /button\.style\.transform = `translate\(/);
});

test('pin icon graphic is visually larger inside the same circular button', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.group-pin-toggle svg\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/
  );
});

test('drag preview only reorders top icons and defers card refresh until drop', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.match(appJs, /if \(options\.reorderCards !== false\)/);
  assert.match(appJs, /applyLiveGroupOrder\(previewOrderKeys,\s*\{\s*reorderCards:\s*false/);
});

test('back-to-top button styles and behavior are wired up', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /\.back-to-top\s*\{/);
  assert.match(css, /\.back-to-top\.visible\s*\{/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*border-radius:\s*999px;/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*var\(--floating-surface-opacity\)/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*backdrop-filter:\s*blur\(10px\)/);
  assert.match(appJs, /window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*'smooth'/);
  assert.match(appJs, /document\.getElementById\('backToTopBtn'\)/);
});

test('deferred drawer styles and behavior are wired up', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(css, /\.drawer-header-actions\s*\{/);
  assert.match(css, /\.drawer-icon-btn\s*\{/);
  assert.match(css, /\.drawer-panel\.is-active\s*\{/);
  assert.match(css, /\.deferred-trigger\s*\{/);
  assert.match(css, /\.deferred-overlay\.visible\s*\{/);
  assert.match(css, /\.deferred-column\.open\s*\{/);
  assert.match(appJs, /const nextOpen = !\(deferredPanelOpen && drawerView === 'saved'\)/);
  assert.match(appJs, /const nextOpen = !\(deferredPanelOpen && drawerView === 'todos'\)/);
  assert.match(appJs, /toggle-saved-search/);
  assert.match(appJs, /toggle-todo-search/);
  assert.match(appJs, /toggle-theme-menu/);
  assert.match(appJs, /select-theme/);
  assert.match(appJs, /themeBackgroundInput/);
  assert.match(appJs, /loadThemePreferences/);
  assert.match(appJs, /e\.key === 'Escape' && deferredPanelOpen/);
  assert.match(appJs, /saveDrawerItemOrder/);
  assert.match(appJs, /previewDrawerItemOrder/);
  assert.match(html, /id="clearTodoArchiveBtn"/);
  assert.match(html, /id="savedSearchToggle"/);
  assert.match(html, /id="todoNewBtn"/);
  assert.match(css, /\.deferred-header\s*\{[\s\S]*animation:\s*none/);
  assert.match(css, /\.drawer-title-btn\.is-active\s*\{[\s\S]*text-decoration:\s*underline/);
});

test('theme menu styles and custom background layer are defined', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.match(css, /--page-custom-background:/);
  assert.match(css, /--custom-surface-opacity:/);
  assert.match(css, /--floating-surface-opacity:/);
  assert.match(css, /--panel-surface-opacity:/);
  assert.match(css, /--tooltip-surface:/);
  assert.match(css, /--tooltip-border:/);
  assert.match(css, /--tooltip-text:/);
  assert.match(css, /--workspace-accent:/);
  assert.match(css, /--workspace-accent-soft:/);
  assert.match(css, /--workspace-accent-border:/);
  assert.match(css, /--workspace-accent-contrast:/);
  assert.match(css, /--banner-action-bg:/);
  assert.match(css, /--banner-action-bg-hover:/);
  assert.match(css, /--banner-action-text:/);
  assert.match(css, /--workspace-chip-bg:/);
  assert.match(css, /--workspace-chip-bg-strong:/);
  assert.match(css, /--workspace-chip-text:/);
  assert.match(css, /--workspace-chip-border:/);
  assert.match(css, /body\s*\{[\s\S]*background-image:\s*var\(--page-custom-background\)/);
  assert.match(css, /\.header-title-row\s*\{[\s\S]*align-items:\s*center;[\s\S]*gap:\s*18px;[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(css, /\.header-left h1\s*\{[\s\S]*margin-bottom:\s*0;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.header-left h1\s*\{[\s\S]*line-height:\s*1;/);
  assert.match(css, /\.header-left \.date\s*\{[\s\S]*font-size:\s*11px;[\s\S]*line-height:\s*1;[\s\S]*transform:\s*translateY\(1px\);/);
  assert.match(css, /\.header-theme-trigger\s*\{/);
  assert.match(css, /\.group-nav-tools\s*\{/);
  assert.match(css, /\.header-theme-trigger::after\s*\{/);
  assert.match(css, /\.header-search-shell\s*\{/);
  assert.match(css, /\.header-search-shell:focus-within\s*\{/);
  assert.match(css, /\.header-search-input\s*\{/);
  assert.match(css, /\.theme-menu\s*\{/);
  assert.match(css, /\.theme-range\s*\{/);
  assert.match(css, /\.theme-option\.is-active\s*\{/);
  assert.match(css, /\.header-theme-trigger\s*\{[\s\S]*background:\s*transparent;/);
  assert.match(appJs, /body\.style\.backgroundImage = `linear-gradient/);
  assert.match(appJs, /body\.classList\.add\('has-custom-background'\)/);
  assert.match(appJs, /body\.classList\.remove\('has-custom-background'\)/);
  assert.match(appJs, /hexToRgbChannels/);
  assert.match(appJs, /surfaceOpacity/);
  assert.match(appJs, /const pinToggle = document\.getElementById\('headerPinToggle'\)/);
  assert.match(appJs, /id="themeMenuTrigger"/);
  assert.match(appJs, /id="headerPinToggle"/);
  assert.match(appJs, /id="themeMenuPanel"/);
  assert.match(appJs, /id="themeBackgroundInput"/);
  assert.match(appJs, /id="themeTransparencyRange"/);
  assert.match(appJs, /id="themeTransparencyValue"/);
  assert.match(appJs, /chrome\.search\?\.query/);
  assert.match(appJs, /disposition:\s*'CURRENT_TAB'/);
  assert.match(appJs, /e\.target\.id !== 'headerSearchForm'/);
  assert.match(appJs, /runDefaultSearch\(query\)/);
  assert.match(appJs, /'--workspace-accent':/);
  assert.match(appJs, /'--workspace-accent-soft':/);
  assert.match(appJs, /'--workspace-accent-border':/);
  assert.match(appJs, /'--workspace-accent-contrast':/);
  assert.match(css, /\.mission-card\s*\{[\s\S]*var\(--custom-surface-opacity\)/);
  assert.match(css, /\.section-count\s*\{[\s\S]*color:\s*var\(--workspace-chip-text\);/);
  assert.match(css, /\.group-nav-button\s*\{[\s\S]*var\(--custom-surface-opacity\)/);
  assert.match(css, /\.group-nav-button::after,\s*\.group-pin-toggle::after\s*\{[\s\S]*background:\s*var\(--tooltip-surface\);[\s\S]*color:\s*var\(--tooltip-text\);[\s\S]*border:\s*1px solid var\(--tooltip-border\);/);
  assert.match(css, /\.tab-cleanup-banner\s*\{[\s\S]*var\(--theme-accent-soft\)[\s\S]*border:\s*1px solid var\(--theme-accent-muted\);/);
  assert.match(css, /\.tab-cleanup-icon svg\s*\{[\s\S]*color:\s*var\(--theme-accent-strong\);/);
  assert.match(css, /\.tab-cleanup-btn\s*\{[\s\S]*background:\s*var\(--banner-action-bg\);[\s\S]*color:\s*var\(--banner-action-text\);/);
  assert.match(css, /\.tab-cleanup-btn:hover\s*\{[\s\S]*background:\s*var\(--banner-action-bg-hover\);/);
  assert.match(css, /\.open-tabs-badge\s*\{[\s\S]*color:\s*var\(--workspace-chip-text\);[\s\S]*background:\s*var\(--workspace-chip-bg\);[\s\S]*border:\s*1px solid var\(--workspace-chip-border\);/);
  assert.match(css, /\.open-tabs-badge\.is-duplicate\s*\{[\s\S]*background:\s*var\(--workspace-chip-bg-strong\);/);
  assert.match(css, /\.action-btn\.close-tabs\s*\{[\s\S]*border-color:\s*var\(--workspace-chip-border\);[\s\S]*color:\s*var\(--workspace-chip-text\);[\s\S]*background:\s*var\(--workspace-chip-bg\);/);
  assert.match(css, /\.action-btn\.close-tabs:hover\s*\{[\s\S]*background:\s*var\(--workspace-chip-bg-strong\);[\s\S]*border-color:\s*var\(--workspace-accent-border\);/);
  assert.match(css, /\.deferred-shell\s*\{[\s\S]*var\(--panel-surface-opacity\)/);
  assert.match(css, /\.todo-detail-card\s*\{[\s\S]*var\(--panel-card-opacity\)/);
});

test('quick tabs area renders shortcut cards and add button hooks', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.match(css, /\.quick-tabs-grid\s*\{/);
  assert.match(css, /\.quick-tabs-grid\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*flex-start;/);
  assert.match(css, /\.quick-shortcut-card\s*\{/);
  assert.match(css, /\.quick-shortcut-card\s*\{[\s\S]*border:\s*none;/);
  assert.match(css, /\.quick-shortcut-card\s*\{[\s\S]*grid-template-rows:\s*38px auto;/);
  assert.match(css, /\.quick-shortcut-card\s*\{[\s\S]*width:\s*54px;[\s\S]*flex:\s*0 0 54px;/);
  assert.match(css, /\.quick-shortcut-remove\s*\{/);
  assert.match(appJs, /QUICK_SHORTCUTS_KEY/);
  assert.match(appJs, /renderQuickShortcuts/);
  assert.match(appJs, /add-quick-shortcut/);
  assert.match(appJs, /remove-quick-shortcut/);
  assert.match(appJs, /open-quick-shortcut/);
  assert.match(appJs, /openOrFocusUrl/);
  assert.doesNotMatch(appJs, /title="\$\{safeLabel\}"/);
  assert.match(appJs, /data-chip-sort-id="\$\{safeSortId\}"[\s\S]*aria-label="\$\{safeTitle\}"/);
  assert.doesNotMatch(appJs, /Add tab/);
});

test('collapsed drawer triggers use compact neutral frames with theme-ready tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /--drawer-trigger-surface:/);
  assert.match(css, /--drawer-trigger-border:/);
  assert.match(css, /--drawer-trigger-icon:/);
  assert.match(css, /\.deferred-trigger\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;[\s\S]*padding:\s*0;/);
  assert.match(css, /\.deferred-trigger-icon\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/);
  assert.doesNotMatch(css, /#deferredTrigger\s*\{/);
  assert.doesNotMatch(css, /#todoTrigger\s*\{/);
});

test('saved and todo lists expose drag handles with drag-state styling', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(appJs, /class="drawer-reorder-handle"/);
  assert.match(appJs, /data-chip-drag-handle="tab"/);
  assert.match(appJs, /const GROUP_TAB_ORDER_KEY = 'groupTabOrder'/);
  assert.match(appJs, /saveGroupTabRowOrder/);
  assert.match(appJs, /updateGroupNavButtonIcon/);
  assert.match(appJs, /tabs:\s*getOrderedUniqueTabsForGroup\(group\)/);
  assert.match(appJs, /if \(node === draggedPageChipEl\) return '';/);
  assert.match(appJs, /data-drag-handle="saved"/);
  assert.match(appJs, /data-drag-handle="todo"/);
  assert.doesNotMatch(appJs, /title="Drag to reorder"/);
  assert.match(css, /\.drawer-reorder-handle\s*\{/);
  assert.match(css, /\.page-chip > \.chip-reorder-handle\s*\{/);
  assert.match(css, /\.chip-reorder-handle\s*\{[\s\S]*opacity:\s*1;[\s\S]*workspace-chip-text/);
  assert.match(css, /\.drawer-reorder-placeholder\s*\{/);
  assert.match(css, /body\.page-chip-list-dragging\s*\{/);
  assert.match(css, /\.page-chip\.is-dragging\s*\{/);
  assert.match(css, /\.chip-reorder-placeholder\s*\{/);
  assert.match(css, /\.deferred-item\.is-dragging,\s*\.todo-item\.is-dragging\s*\{/);
});

test('saved trigger icon uses the envelope artwork', () => {
  assert.match(html, /id="deferredTrigger"[\s\S]*M834\.395 794\.9l-641\.007-0\.482/);
  assert.match(html, /id="deferredTrigger"[\s\S]*M504\.989 654\.358l-338\.808-265\.775/);
});

test('collapsed drawer triggers stay icon-only', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.doesNotMatch(appJs, /deferredTriggerCount/);
  assert.doesNotMatch(appJs, /if \(totalCount === 0\) \{[\s\S]*trigger\.style\.display = 'none';/);
});

test('todo trigger icon uses the checklist artwork', () => {
  assert.match(html, /id="todoTrigger"[\s\S]*M288\.384 173\.488a94\.208 94\.208 0 0 1 93\.392-81\.488/);
  assert.match(html, /id="todoTrigger"[\s\S]*M926\.624 660\.752a32 32 0 0 1 0 45\.248/);
});

test('archive supports deleting single items and clearing all archived items', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(appJs, /restore-deferred/);
  assert.match(appJs, /reopenSavedTab\(restored\.url\)/);
  assert.match(appJs, /currentTab\.url !== 'about:blank'/);
  assert.match(appJs, /delete-archive-item/);
  assert.match(appJs, /clear-archive/);
  assert.match(appJs, /clear-todo-archive/);
  assert.match(html, /class="archive-header-row"/);
  assert.match(html, /id="clearArchiveBtn"/);
  assert.doesNotMatch(appJs, /archive-actions/);
});

test('deferred trigger position is persisted separately from drawer open state', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(appJs, /const DEFERRED_TRIGGER_POSITION_KEY = 'deferredTriggerPosition'/);
  assert.match(appJs, /saveDeferredTriggerPosition/);
});

test('deferred trigger supports vertical drag positioning', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(appJs, /deferredTriggerDragState/);
  assert.match(appJs, /e\.target\.closest\('\.deferred-trigger'\)/);
  assert.match(appJs, /triggerStack\.style\.top = `\$\{nextTop}px`/);
});
