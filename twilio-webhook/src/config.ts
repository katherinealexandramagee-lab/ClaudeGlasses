import dotenv from 'dotenv';
dotenv.config();

/**
 * Application configuration
 * All sensitive values come from environment variables
 */
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3456', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
  },

  // Anthropic (Claude)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 150, // Keep short for voice responses
  },

  // OpenClaw (optional)
  openClaw: {
    webhookUrl: process.env.OPENCLAW_WEBHOOK_URL || '',
    apiKey: process.env.OPENCLAW_API_KEY || '',
  },

  // ElevenLabs TTS (optional)
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
  },

  // Security
  security: {
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    allowedCallerIds: (process.env.ALLOWED_CALLER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0),
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
  },
};

/**
 * Validate required configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.twilio.accountSid) {
    errors.push('TWILIO_ACCOUNT_SID is required');
  }
  if (!config.twilio.authToken) {
    errors.push('TWILIO_AUTH_TOKEN is required');
  }
  if (!config.anthropic.apiKey && !config.openClaw.webhookUrl) {
    errors.push('Either ANTHROPIC_API_KEY or OPENCLAW_WEBHOOK_URL is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if OpenClaw integration is configured
 */
export function useOpenClaw(): boolean {
  return config.openClaw.webhookUrl.length > 0;
}

/**
 * Check if ElevenLabs TTS is configured
 */
export function useElevenLabs(): boolean {
  return config.elevenLabs.apiKey.length > 0;
}
