import jwt from 'jsonwebtoken';

export const TOKEN_TYPES = Object.freeze({
  RESTAURANT_SESSION: 'restaurant-session',
  SUPER_ADMIN_SESSION: 'super-admin-session',
  ORDER_TRACKING: 'order-tracking',
});

const tokenDefinitions = Object.freeze({
  [TOKEN_TYPES.RESTAURANT_SESSION]: {
    audience: 'restaurant-api',
    expiresIn: '24h',
  },
  [TOKEN_TYPES.SUPER_ADMIN_SESSION]: {
    audience: 'super-admin-api',
    expiresIn: '24h',
  },
  [TOKEN_TYPES.ORDER_TRACKING]: {
    audience: 'order-tracking',
    expiresIn: '24h',
  },
});

const issuer = () => process.env.TOKEN_ISSUER || 'bolt-qr-api';

export const issueToken = (type, payload, secret, { subject } = {}) => {
  const definition = tokenDefinitions[type];
  if (!definition) throw new Error(`Unknown token type: ${type}`);
  return jwt.sign(
    { ...payload, purpose: type },
    secret,
    {
      issuer: issuer(),
      audience: definition.audience,
      expiresIn: definition.expiresIn,
      ...(subject ? { subject } : {}),
    },
  );
};

export const verifyToken = (type, token, secret) => {
  const definition = tokenDefinitions[type];
  if (!definition) throw new Error(`Unknown token type: ${type}`);
  const claims = jwt.verify(token, secret, {
    issuer: issuer(),
    audience: definition.audience,
  });
  if (claims.purpose !== type) throw new Error('Token purpose mismatch');
  return claims;
};

export const verifyAuthToken = (token, secret) => {
  for (const type of [TOKEN_TYPES.RESTAURANT_SESSION, TOKEN_TYPES.SUPER_ADMIN_SESSION]) {
    try {
      return verifyToken(type, token, secret);
    } catch {
      // Try the other explicitly-scoped authentication class.
    }
  }
  throw new Error('Invalid authentication token');
};

export const tokenDefinition = type => tokenDefinitions[type];
