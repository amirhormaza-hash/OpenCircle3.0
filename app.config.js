// Dynamic config layered over app.json.
//
// Its only job is to let a development build live on the same phone as the
// Play Store / TestFlight build. Android refuses to install two APKs sharing a
// package name when they are signed with different keys, and Play re-signs
// everything it distributes — so the dev build and the store build collide
// with "App not installed" unless they are genuinely different applications.
//
// Opt-in, not opt-out: anything that is not explicitly APP_VARIANT=development
// gets the real identifiers. A forgotten variable then produces a dev build
// that collides (annoying) rather than a store build with a .dev package name
// (unshippable, and only discovered at upload).
//
// Set in eas.json per profile, and in .env.local so local Metro matches the
// dev build it is serving.

const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }) => {
  if (!IS_DEV) return config;

  return {
    ...config,
    // Distinguishable on the home screen, where both icons sit side by side.
    name: 'OpenCircle Dev',
    // The deep-link scheme has to differ too, or the OS picks whichever app it
    // likes when opening an opencircle:// link.
    scheme: 'opencircle-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}.dev`,
    },
    android: {
      ...config.android,
      package: `${config.android.package}.dev`,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        // Tints the launcher icon so the two are tellable apart at a glance.
        backgroundColor: '#2A1A3E',
      },
    },
  };
};
