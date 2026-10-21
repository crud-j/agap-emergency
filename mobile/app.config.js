// Extends app.json with values that depend on the deployment environment.
//
// Passkeys: iOS only lets the app use passkeys for a domain listed under
// "webcredentials:" in Associated Domains, and that domain must serve
// /.well-known/apple-app-site-association (the backend does). Set
// EXPO_PUBLIC_PASSKEY_RP_ID to the same value as the backend WEBAUTHN_RP_ID.
// Android needs no app-side config; the domain's /.well-known/assetlinks.json
// (also served by the backend) vouches for the signing certificate.
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-sharing')) {
    plugins.push('expo-sharing');
  }
  const configured = { ...config, plugins };
  const rpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID;
  if (!rpId) return configured;

  const existing = configured.ios?.associatedDomains ?? [];
  return {
    ...configured,
    ios: {
      ...configured.ios,
      associatedDomains: [...new Set([...existing, `webcredentials:${rpId}`])],
    },
  };
};
