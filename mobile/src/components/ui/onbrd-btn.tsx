import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface OnboardButtonProps extends TouchableOpacityProps {
  label?: string;
}

export function OnboardButton({ label = 'Continue', onPress, disabled, ...rest }: OnboardButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-full"
      {...rest}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        className="w-full h-[52px] rounded-full items-center justify-center overflow-hidden"
        style={{ backgroundColor: disabled ? '#6B9E97' : '#0D6053' }}
      >
        <Text className="text-lg font-semibold text-white tracking-wide">
          {label}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default OnboardButton;
