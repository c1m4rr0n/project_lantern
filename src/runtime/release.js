import { readFileSync } from 'node:fs';
const metadata = JSON.parse(readFileSync(new URL('../../release.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
if (metadata.version !== pkg.version) throw new Error('release_metadata_version_mismatch');
export function releaseIdentity(env = process.env) {
  const sha = env.GIT_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || '';
  return { version:pkg.version, name:metadata.name, commit:/^[a-f0-9]{40}$/i.test(sha) ? sha : null };
}
