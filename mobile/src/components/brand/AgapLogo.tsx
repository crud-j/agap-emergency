import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const AGAP_WORDMARK = require('@/assets/icons/agap-icon.png') as number;

/**
 * Official AGAP wordmark (mark + name + "Incident Management Platform" tagline).
 * Single source for the logo so the citizen and responder surfaces never drift.
 * The asset is ~3:1, so keep the aspect ratio when overriding the size.
 */
export function AgapLogo({
  width = 130,
  height = 44,
  style,
}: {
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={AGAP_WORDMARK}
      style={[{ width, height }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="AGAP — Incident Management Platform"
    />
  );
}

export default AgapLogo;
