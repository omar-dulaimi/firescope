export function getMoreMenuItems(themeManager) {
  const items = [];
  const current = themeManager.getCurrentTheme();
  const systemIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 4h18v2H3V4zm0 14h18v2H3v-2zM3 9h18v6H3V9z"/></svg>';
  const sunIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zm9-10v-2h-3v2h3zm-3.95 7.95l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM13 1h-2v3h2V1zm4.24 3.05l1.79-1.8-1.41-1.41-1.8 1.79 1.42 1.42zM12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>';
  const moonIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12.74 2a8.5 8.5 0 108.52 8.52A7 7 0 0112.74 2z"/></svg>';
  const githubIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 .5C5.73.5.88 5.35.88 11.62c0 4.89 3.17 9.03 7.56 10.49.55.1.75-.24.75-.53 0-.26-.01-1.12-.02-2.03-3.07.67-3.72-1.3-3.72-1.3-.5-1.26-1.22-1.6-1.22-1.6-.99-.68.08-.66.08-.66 1.1.08 1.68 1.12 1.68 1.12.98 1.67 2.57 1.19 3.2.91.1-.71.38-1.19.69-1.46-2.45-.28-5.03-1.22-5.03-5.42 0-1.2.43-2.17 1.12-2.93-.11-.28-.49-1.42.11-2.96 0 0 .93-.3 3.04 1.12.89-.25 1.85-.37 2.8-.38.95 0 1.91.13 2.8.38 2.11-1.42 3.04-1.12 3.04-1.12.6 1.54.22 2.68.11 2.96.69.76 1.12 1.73 1.12 2.93 0 4.21-2.58 5.13-5.04 5.4.39.34.74 1.02.74 2.06 0 1.49-.01 2.69-.01 3.06 0 .29.2.64.75.53 4.39-1.46 7.56-5.6 7.56-10.49C23.12 5.35 18.27.5 12 .5z"/></svg>';
  const issueIcon =
    '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2V8h2v6z"/></svg>';
  const bookIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18 2H6a2 2 0 00-2 2v16a1 1 0 001.53.85L12 18l6.47 2.85A1 1 0 0020 20V4a2 2 0 00-2-2z"/></svg>';
  const gearIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.44 3.06l-1.7-.98c.04-.35.06-.7.06-1.06s-.02-.71-.06-1.06l1.7-.98a.5.5 0 00.22-.64l-1.62-2.8a.5.5 0 00-.6-.22l-1.7.98a8.12 8.12 0 00-1.84-1.06V2.5a.5.5 0 00-.5-.5h-3.24a.5.5 0 00-.5.5v1.94c-.64.24-1.26.56-1.84 1.06l-1.7-.98a.5.5 0 00-.6.22L2.34 7.54a.5.5 0 00.22.64l1.7.98c-.04.35-.06.7-.06 1.06s.02.71.06 1.06l-1.7.98a.5.5 0 00-.22.64l1.62 2.8c.14.24.45.32.68.2l1.7-.98c.58.49 1.2.82 1.84 1.06v1.94c0 .28.22.5.5.5h3.24c.28 0 .5-.22.5-.5v-1.94c.64-.24 1.26-.56 1.84-1.06l1.7.98c.23.12.54.04.68-.2l1.62-2.8a.5.5 0 00-.22-.64z"/></svg>';

  items.push({
    text: 'Theme: System',
    value: 'theme-system',
    isSelected: current === 'system',
    onClick: () => themeManager.setTheme('system'),
    icon: systemIcon,
  });
  items.push({
    text: 'Theme: Light',
    value: 'theme-light',
    isSelected: current === 'light',
    onClick: () => themeManager.setTheme('light'),
    icon: sunIcon,
  });
  items.push({
    text: 'Theme: Dark',
    value: 'theme-dark',
    isSelected: current === 'dark',
    onClick: () => themeManager.setTheme('dark'),
    icon: moonIcon,
  });
  items.push({
    text: 'GitHub Repository',
    value: 'repo',
    onClick: () =>
      window.open('https://github.com/omar-dulaimi/firescope', '_blank'),
    icon: githubIcon,
  });
  items.push({
    text: 'Report an Issue',
    value: 'issues',
    onClick: () =>
      window.open(
        'https://github.com/omar-dulaimi/firescope/issues/new/choose',
        '_blank'
      ),
    icon: issueIcon,
  });
  items.push({
    text: 'Documentation',
    value: 'docs',
    onClick: () =>
      window.open('https://github.com/omar-dulaimi/firescope#readme', '_blank'),
    icon: bookIcon,
  });
  items.push({
    text: 'Options',
    value: 'options',
    onClick: () => {
      try {
        chrome.runtime.openOptionsPage();
      } catch (err) {
        console.log('[FireScope Pro] Options page unavailable:', err);
      }
    },
    icon: gearIcon,
  });
  items.push({
    text: 'Clear Pro URL Cache',
    value: 'clear-cache',
    onClick: () => {
      try {
        chrome.storage.local.get(null, all => {
          const keys = Object.keys(all || {}).filter(k =>
            k.startsWith('firescope_pro_cache_')
          );
          if (keys.length) chrome.storage.local.remove(keys);
        });
      } catch (err) {
        console.log('[FireScope Pro] Failed to clear cache:', err);
      }
    },
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 6h18v2H3V6zm2 3h14l-1 12H6L5 9zm4-5h6v2H9V4z"/></svg>',
  });
  return items;
}
