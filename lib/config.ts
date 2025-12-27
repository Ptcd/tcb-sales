/**
 * Feature flags and configuration
 * 
 * JCC Features: Controls whether JCC-specific functionality is enabled.
 * Set ENABLE_JCC_FEATURES=false in environment variables to disable JCC features for forks.
 */
export const JCC_FEATURES_ENABLED = process.env.ENABLE_JCC_FEATURES !== 'false';


