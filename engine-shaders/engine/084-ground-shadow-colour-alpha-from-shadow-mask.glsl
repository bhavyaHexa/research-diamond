// Ground shadow: colour/alpha from shadow mask
// group: Ground, background & shadows   stage: fragment injection
// role: class Ig
// owner (minified): Ig
// source: bundle-0.8.0.mjs, character offset 1790428 (original minified file on branch main)

gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
