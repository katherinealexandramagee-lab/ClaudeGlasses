import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { config } from './config';

/**
 * Validate that the request is actually from Twilio
 * Uses Twilio's webhook signature validation
 */
export function validateTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip validation in development if no auth token configured
  if (config.nodeEnv === 'development' && !config.twilio.authToken) {
    console.warn('⚠️  Skipping Twilio signature validation (development mode)');
    next();
    return;
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;

  if (!twilioSignature) {
    console.error('❌ Missing Twilio signature header');
    res.status(403).send('Forbidden: Missing signature');
    return;
  }

  // Construct the full URL that Twilio used to sign the request
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['host'];
  const url = `${protocol}://${host}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    config.twilio.authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.error('❌ Invalid Twilio signature');
    console.error('   URL:', url);
    res.status(403).send('Forbidden: Invalid signature');
    return;
  }

  next();
}

/**
 * Check if the caller is in the allowed list
 * Only enforced if ALLOWED_CALLER_IDS is configured
 */
export function validateCaller(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { allowedCallerIds } = config.security;

  // Skip if no allowed list configured
  if (allowedCallerIds.length === 0) {
    next();
    return;
  }

  const callerNumber = req.body.From || req.body.Caller;

  if (!callerNumber || !allowedCallerIds.includes(callerNumber)) {
    console.warn(`⚠️  Blocked call from unauthorized number: ${callerNumber}`);

    // Return TwiML that rejects the call politely
    res.type('text/xml');
    res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Sorry, this number is not authorized to use this service.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  next();
}

/**
 * Sanitize user input to prevent prompt injection
 * Returns sanitized text and a flag if suspicious content was found
 */
export function sanitizeInput(text: string): { sanitized: string; suspicious: boolean } {
  if (!text) {
    return { sanitized: '', suspicious: false };
  }

  let suspicious = false;

  // Patterns that might indicate prompt injection attempts
  const dangerousPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /disregard\s+(all\s+)?(previous|prior|above)/gi,
    /you\s+are\s+now\s+(a|an)/gi,
    /new\s+(instructions|role|persona):/gi,
    /system\s*prompt:/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /```system/gi,
    /admin\s*override/gi,
    /developer\s*mode/gi,
    /jailbreak/gi,
  ];

  let sanitized = text;

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      suspicious = true;
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }
  }

  // Limit length (voice input shouldn't be super long)
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500);
    suspicious = true;
  }

  return { sanitized, suspicious };
}

/**
 * Rate limiting state (in-memory, resets on restart)
 * For production, use Redis or similar
 */
const rateLimitState = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiter by caller ID
 */
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const callerId = req.body.From || req.body.Caller || req.ip;
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  let state = rateLimitState.get(callerId);

  if (!state || now > state.resetTime) {
    state = { count: 0, resetTime: now + windowMs };
    rateLimitState.set(callerId, state);
  }

  state.count++;

  if (state.count > maxRequests) {
    console.warn(`⚠️  Rate limit exceeded for: ${callerId}`);

    res.type('text/xml');
    res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>You've made too many requests. Please try again later.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  next();
}

/**
 * Log all requests for audit purposes
 */
export function auditLog(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    caller: req.body.From || req.body.Caller || 'unknown',
    callSid: req.body.CallSid || 'unknown',
    // Don't log full speech - privacy concern
    speechLength: req.body.SpeechResult?.length || 0,
  };

  console.log('📞 Request:', JSON.stringify(logEntry));

  next();
}
