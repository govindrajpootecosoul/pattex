/** JWT session lifetime. Default: 30 days (1 month). Override via JWT_EXPIRES_IN in .env */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
