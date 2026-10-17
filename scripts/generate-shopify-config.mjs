import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const root = new URL('../', import.meta.url);

try {
  // Existing process environment values take precedence (for CI).
  loadEnvFile(new URL('.env', root));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env or the process environment.`);
  return value;
}

function httpUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must contain a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must contain a valid HTTP(S) URL.`);
  }
  return value;
}

// JSON string escaping is compatible with TOML basic strings, except for
// DEL, which TOML requires to be escaped explicitly.
const quote = (value) => JSON.stringify(value).replace(/\u007f/g, '\\u007f');

const embedded = required('SHOPIFY_APP_EMBEDDED');
if (!['true', 'false'].includes(embedded)) {
  throw new Error('SHOPIFY_APP_EMBEDDED must be true or false.');
}

if (process.env.SHOPIFY_AUTH_REDIRECT_URLS === undefined) {
  throw new Error('Set SHOPIFY_AUTH_REDIRECT_URLS; use an empty value for no callbacks.');
}
const redirects = process.env.SHOPIFY_AUTH_REDIRECT_URLS
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => quote(httpUrl(value, 'SHOPIFY_AUTH_REDIRECT_URLS')));

const values = {
  SHOPIFY_API_KEY: quote(required('SHOPIFY_API_KEY')),
  SHOPIFY_APP_NAME: quote(required('SHOPIFY_APP_NAME')),
  SHOPIFY_APP_URL: quote(httpUrl(required('SHOPIFY_APP_URL'), 'SHOPIFY_APP_URL')),
  SHOPIFY_APP_EMBEDDED: embedded,
  SHOPIFY_AUTH_REDIRECT_URLS: `[${redirects.join(', ')}]`,
  SHOPIFY_WEBHOOK_API_VERSION: quote(required('SHOPIFY_WEBHOOK_API_VERSION')),
};

const template = readFileSync(new URL('shopify.app.toml.template', root), 'utf8');
const config = template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
  if (!Object.hasOwn(values, name)) throw new Error(`Unknown config placeholder: ${name}`);
  return values[name];
});

writeFileSync(new URL('shopify.app.toml', root), config);
console.log('Generated shopify.app.toml from environment settings.');
