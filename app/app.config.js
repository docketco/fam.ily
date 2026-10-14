// The browser demo (EXPO_PUBLIC_DEMO=1) is exported as one single-page app; everything else
// comes from app.json unchanged.
module.exports = ({ config }) =>
  process.env.EXPO_PUBLIC_DEMO === '1' ? { ...config, web: { ...config.web, output: 'single' } } : config;
