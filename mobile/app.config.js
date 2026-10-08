// Extends app.json with values that depend on the deployment environment.
//
// Passkeys: iOS only lets the app use passkeys for a domain listed under
// "webcredentials:" in Associated Domains, and that domain must serve
// /.well-known/apple-app-site-association (the backend does). Set
// EXPO_PUBLIC_PASSKEY_RP_ID to the same value as the backend WEBAUTHN_RP_ID.
// Android needs no app-side config; the domain's /.well-known/assetlinks.json
// (also served by the backend) vouches for the signing certificate.
module.exports = ({ config }) => {
  const rpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID;
  if (!rpId) return config;

  const existing = config.ios?.associatedDomains ?? [];
  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: [...new Set([...existing, `webcredentials:${rpId}`])],
    },
  };
};
