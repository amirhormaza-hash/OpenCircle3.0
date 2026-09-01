// Hosted legal documents and the terms version users accept at sign-up.
//
// TERMS_VERSION is stamped onto profiles.terms_accepted_version when a user
// agrees. Bump it (to the new effective date) whenever docs/terms.html changes
// materially, so it stays possible to tell who accepted which version.

const DOCS_BASE = 'https://amirhormaza-hash.github.io/OpenCircle3.0';

export const TERMS_URL = `${DOCS_BASE}/terms.html`;
export const PRIVACY_URL = `${DOCS_BASE}/privacy.html`;
export const SUPPORT_URL = `${DOCS_BASE}/support.html`;

/** Matches the effective date at the top of docs/terms.html. */
export const TERMS_VERSION = '2026-08-27';

/** Published contact address, required by App Store Guideline 1.2. */
export const SUPPORT_EMAIL = 'amirhormaza@gmail.com';
