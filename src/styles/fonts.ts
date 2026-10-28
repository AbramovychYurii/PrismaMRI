/**
 * IBM Plex, bundled with the app instead of fetched from Google Fonts, so the
 * first load makes no third-party request and the PWA precache covers the
 * fonts for offline use. Weights mirror what globals.css and the components ask
 * for; each file carries every subset behind a unicode-range, so a page load
 * fetches only the scripts it renders, while the PWA precache takes all of
 * them (~1 MB of woff2) so any script still renders offline.
 */
import '@fontsource/ibm-plex-serif/300.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/400-italic.css';
import '@fontsource/ibm-plex-serif/500.css';
import '@fontsource/ibm-plex-serif/600.css';

import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
