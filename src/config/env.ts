const ENV = {
  // All traffic routes through the strike-gateway.
  // Android emulator reaches host machine via 10.0.2.2.
  // iOS simulator uses localhost. Physical devices need the LAN IP set in .env.
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000',
  API_TIMEOUT_MS: Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? '10000'),
} as const;

export default ENV;
