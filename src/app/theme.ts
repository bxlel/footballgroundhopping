import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Thème PrimeNG de Spot the Game : la base Aura, avec le violet de la marque en couleur
 * primaire, des surfaces légèrement teintées et des angles plus ronds.
 * Les couleurs propres au site (dégradés, fonds) sont dans src/styles/_tokens.scss.
 */
export const SpotTheGameTheme = definePreset(Aura, {
  primitive: {
    borderRadius: { xs: '6px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
  },
  semantic: {
    primary: {
      50: '{violet.50}',
      100: '{violet.100}',
      200: '{violet.200}',
      300: '{violet.300}',
      400: '{violet.400}',
      500: '{violet.500}',
      600: '{violet.600}',
      700: '{violet.700}',
      800: '{violet.800}',
      900: '{violet.900}',
      950: '{violet.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{violet.700}',
          contrastColor: '#ffffff',
          hoverColor: '{violet.800}',
          activeColor: '{violet.900}',
        },
        surface: {
          0: '#ffffff',
          50: '#f6f4fd',
          100: '#f1edfb',
          200: '#e4def4',
          300: '#cfc7e6',
          400: '#9c94b5',
          500: '#766e90',
          600: '#5d5578',
          700: '#443c5e',
          800: '#2c2447',
          900: '#1b1235',
          950: '#120b26',
        },
      },
      dark: {
        primary: {
          color: '#b79cff',
          contrastColor: '#1b1235',
          hoverColor: '#d0bfff',
          activeColor: '#e2d8ff',
        },
        surface: {
          0: '#ffffff',
          50: '#f4f0ff',
          100: '#e3dcf5',
          200: '#cdc4e6',
          300: '#b5accf',
          400: '#8d84ab',
          500: '#665d87',
          600: '#463d68',
          700: '#2f2752',
          800: '#211a40',
          900: '#181230',
          950: '#0e0a1d',
        },
      },
    },
  },
});
