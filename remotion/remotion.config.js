import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./src/index.jsx');
// Large clip files (85 MB+) need more than the 30 s default to load in headless Chrome.
Config.setDelayRenderTimeoutInMilliseconds(120000);
// swangle (SwiftShader + ANGLE) is the recommended headless GL renderer on Windows.
Config.setChromiumOpenGlRenderer('swangle');
