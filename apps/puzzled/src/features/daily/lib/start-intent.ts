/**
 * A pressed "Play" carried across one navigation.
 *
 * Starting a game takes one of the day's free picks, so the board opens only
 * on an explicit press (docs/game-protocol.md). A Play button on home or on a
 * game page links to the started board (`?start=1#play`); pressing it records
 * the game here, and that page reads the record once to start at once instead
 * of asking a second time. A link opened any other way (pasted, shared,
 * crawled) carries no record, so it shows the start card and waits.
 */

import { START_INTENT_KEY } from '@/lib/storage-keys'

/** Attribute that marks a link as a Play press for the named game. */
export const START_INTENT_ATTRIBUTE = 'data-start-intent'

/** A press older than this is stale (a slow or abandoned navigation). */
export const START_INTENT_TTL_MS = 60_000

type StartIntent = { slug: string; href: string; at: number }

// One writer, installed in the SSR document before either native or Solid navigation.
// Across documents, only the clicked navigation may carry the intent forward.
export const captureStartIntentScript = `(()=>{
  const key=${JSON.stringify(START_INTENT_KEY)};
  try{
    const raw=sessionStorage.getItem(key);
    if(raw){
      const {href,from}=JSON.parse(raw)||{};
      if(href!==location.href||!from||from!==document.referrer.split(/[?#]/)[0]||performance.getEntriesByType('navigation')[0]?.type!=='navigate')sessionStorage.removeItem(key);
    }
  }catch{}
  document.addEventListener('click',e=>{
    if(!e.isTrusted||e.defaultPrevented||e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
    const link=e.target.closest?.('a[${START_INTENT_ATTRIBUTE}][href]');
    if(!link||link.hasAttribute('download')||(link.target&&link.target.toLowerCase()!=='_self'))return;
    const slug=link.getAttribute('${START_INTENT_ATTRIBUTE}');
    if(!slug||link.origin!==location.origin||link.href===location.href)return;
    try{sessionStorage.setItem(key,JSON.stringify({slug,href:link.href,from:location.origin+location.pathname,at:Date.now()}))}catch{}
  });
})()`

function session(): Storage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

/** Pure check: does a stored record admit an immediate start at the pressed link’s destination? */
export function intentMatches(
	raw: string | null,
	slug: string,
	href: string,
	now: number,
): boolean {
	if (!raw) return false
	try {
		const value = JSON.parse(raw) as Partial<StartIntent>
		return (
			value.slug === slug &&
			value.href === href &&
			typeof value.at === 'number' &&
			now - value.at >= 0 &&
			now - value.at <= START_INTENT_TTL_MS
		)
	} catch {
		return false
	}
}

/** Read and clear the record; true when it matches this destination and is fresh. */
export function takeStartIntent(slug: string, now: number = Date.now()): boolean {
	const store = session()
	if (!store) return false
	try {
		const raw = store.getItem(START_INTENT_KEY)
		store.removeItem(START_INTENT_KEY)
		return intentMatches(raw, slug, window.location.href, now)
	} catch {
		return false
	}
}
