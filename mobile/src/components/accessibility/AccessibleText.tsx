import React from 'react';
import { Text, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { useFontScale } from '../../hooks/useAccessibility';
import { useAccessibilityStore } from '../../stores/accessibility.store';

/**
 * MOD-04 — Accessibility.
 *
 * Drop-in replacement for <Text> that honours the user's accessibility
 * preferences app-wide:
 *  - scales the font size by the selected text-size preference (small/med/large)
 *  - darkens body text to near-black when High Contrast is on
 *
 * Usage: <AccessibleText style={{ fontSize: 16 }}>Hello</AccessibleText>
 * A `tone` prop opts specific roles into contrast-aware colours.
 */
export type TextTone = 'default' | 'muted' | 'inverse';

export interface AccessibleTextProps extends TextProps {
  tone?: TextTone;
}

export function AccessibleText({ tone = 'default', style, ...rest }: AccessibleTextProps) {
  const { scale } = useFontScale();
  const highContrast = useAccessibilityStore((s) => s.highContrast);

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const baseSize = typeof flat.fontSize === 'number' ? flat.fontSize : 15;

  const color = toneColor(tone, highContrast, flat.color as string | undefined);

  return (
    <Text
      {...rest}
      // Respect OS font scaling too, but cap it so layouts don't break.
      maxFontSizeMultiplier={1.6}
      style={[style, { fontSize: Math.round(baseSize * scale), ...(color ? { color } : {}) }]}
    />
  );
}

function toneColor(tone: TextTone, highContrast: boolean, explicit?: string): string | undefined {
  // An explicit colour on the style always wins unless High Contrast overrides body text.
  if (tone === 'inverse') return highContrast ? '#FFFFFF' : explicit;
  if (highContrast) {
    return tone === 'muted' ? '#1F2937' : '#000000';
  }
  return explicit;
}
