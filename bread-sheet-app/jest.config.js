/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // Resolve @/* path alias defined in tsconfig.json
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/(?!next)|@expo-google-fonts|react-navigation|@react-navigation/.*|@unimodules|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
