/**
 * The version of this build, shown in the sidebar and on the Profile page. The Jenkins build sets
 * both values (see Jenkinsfile): a release tag such as "v2.1.0", or "main" for staging builds of the
 * latest code. Running from source gives "dev".
 */
export const formatVersion = (version?: string, commit?: string): string => {
  if (!version) return 'dev';
  // A release tag names the version on its own; other builds need the commit to tell them apart
  return /^v\d/.test(version) || !commit ? version : `${version} · ${commit}`;
};

export const APP_VERSION = formatVersion(import.meta.env.VITE_APP_VERSION, import.meta.env.VITE_APP_COMMIT);
export const APP_COMMIT: string | undefined = import.meta.env.VITE_APP_COMMIT || undefined;
