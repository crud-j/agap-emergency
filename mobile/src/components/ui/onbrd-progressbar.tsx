import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface OnboardProgressbarProps {
  currentStep?: number;
  totalSteps?: number;
  activeColor?: string;
  inactiveColor?: string;
  style?: ViewStyle;
}

const DOT_RADIUS = 5;
const DOT_SPACING = 15;

export const OnboardProgressbar = ({
  currentStep = 1,
  totalSteps = 4,
  activeColor = '#075B5B',
  inactiveColor = '#D9D9D9',
  style,
}: OnboardProgressbarProps) => {
  const svgWidth = DOT_RADIUS * 2 + (totalSteps - 1) * DOT_SPACING;
  const svgHeight = DOT_RADIUS * 2;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}
      style={[{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      >
        {Array.from({ length: totalSteps }).map((_, index) => (
          <Circle
            key={index}
            cx={DOT_RADIUS + index * DOT_SPACING}
            cy={DOT_RADIUS}
            r={DOT_RADIUS}
            fill={index + 1 === currentStep ? activeColor : inactiveColor}
          />
        ))}
      </Svg>
    </View>
  );
};

export default OnboardProgressbar;
