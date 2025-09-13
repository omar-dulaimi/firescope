// Create the FireScope panel in Chrome DevTools
chrome.devtools.panels.create(
  'FireScope',
  'icons/icon-16.png',
  'src/panel.html',
  () => {}
);
