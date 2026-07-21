// Smoke test de integraciones — SOLO LECTURA, no imprime secretos.
// Uso: node scripts/smoke-integrations.mjs
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (label, extra = '') => console.log(`  ✅ ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, extra = '') => console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);

console.log('— TOAST —');
try {
  const res = await fetch(`${env.TOAST_API_HOST}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: env.TOAST_CLIENT_ID,
      clientSecret: env.TOAST_CLIENT_SECRET,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  });
  if (!res.ok) {
    bad(`login: HTTP ${res.status}`, (await res.text()).slice(0, 120));
  } else {
    const { token } = await res.json();
    ok('login', `token recibido (expira en ${token?.expiresIn ?? '?'} s)`);
    if (!UUID_RE.test(env.TOAST_RESTAURANT_GUID ?? '')) {
      bad('restaurant GUID: no es un UUID válido', 'buscar el correo "Toast API credentials" o Toast Web > Manage credentials');
    } else {
      const meta = await fetch(`${env.TOAST_API_HOST}/menus/v2/metadata`, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          'Toast-Restaurant-External-ID': env.TOAST_RESTAURANT_GUID,
        },
      });
      if (meta.ok) {
        const m = await meta.json();
        ok('menus/v2/metadata', `lastUpdated: ${m.lastUpdated ?? JSON.stringify(m).slice(0, 80)}`);
      } else {
        bad(`menus/v2/metadata: HTTP ${meta.status}`, meta.status === 403 ? 'falta scope menus:read o GUID incorrecto' : (await meta.text()).slice(0, 120));
      }
    }
  }
} catch (e) {
  bad('toast', e.message);
}

console.log('— SHOPIFY —');
try {
  const domain = env.SHOPIFY_STORE_DOMAIN ?? '';
  if (!domain.endsWith('.myshopify.com')) {
    console.log(`  ⚠️  SHOPIFY_STORE_DOMAIN no termina en .myshopify.com — la Admin API requiere el dominio *.myshopify.com de la tienda`);
  }
  // Auth: client-credentials grant (app instalada) — token de 24 h minteado al vuelo.
  let token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET) {
    const cc = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.SHOPIFY_CLIENT_ID,
        client_secret: env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });
    if (cc.ok) {
      token = (await cc.json()).access_token;
      ok('client-credentials grant', 'token de 24 h emitido');
    } else bad(`client-credentials grant: HTTP ${cc.status}`, (await cc.text()).slice(0, 100));
  }
  const res = await fetch(`https://${domain}/admin/api/${env.SHOPIFY_API_VERSION || '2026-01'}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: '{ shop { name currencyCode } productsCount { count } }' }),
  });
  if (!res.ok) {
    bad(`graphql: HTTP ${res.status}`, (await res.text()).slice(0, 120));
  } else {
    const j = await res.json();
    if (j.data?.shop) ok('shop query', `${j.data.shop.name} (${j.data.shop.currencyCode}) · ${j.data.productsCount?.count ?? '?'} productos`);
    else bad('shop query', JSON.stringify(j.errors ?? j).slice(0, 160));
  }
} catch (e) {
  bad('shopify', e.message);
}
