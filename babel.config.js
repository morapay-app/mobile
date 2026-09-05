module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 splits its Babel transform into a separate package
    // (`react-native-worklets`) — this must be the LAST plugin in the list
    // per Reanimated's own setup docs, since it needs to see the output of
    // every other transform (JSX, TS, etc.) before rewriting `worklet`
    // functions.
    plugins: ['react-native-worklets/plugin'],
  };
};
