import { dht } from './dht.js';
import { storageIDB } from './storage-idb.js';
import { buildFileManifest } from './crypto.js';

export async function publishPage(identity, name, htmlContent) {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const file = new File([blob], name + '.html', { type: 'text/html' });
  
  const manifest = await buildFileManifest(file);
  await storageIDB.putManifest(manifest.manifestHash, manifest);
  
  const siteId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const siteUrl = `photon-site://${identity.fingerprint}/${siteId}`;
  
  dht.put('site:' + siteUrl, manifest.manifestHash);
  return { siteUrl, manifestHash: manifest.manifestHash };
}

export async function resolveSite(siteUrl) {
  const manifestHash = dht.get('site:' + siteUrl);
  if (!manifestHash) return null;
  return await storageIDB.getManifest(manifestHash);
}
