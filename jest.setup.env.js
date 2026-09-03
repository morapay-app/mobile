// `src/config/env.ts` throws at import time if these are missing — most
// test files avoid ever importing anything that pulls it in, but a couple
// (api/client.ts's own tests) need it satisfied just to import the module
// under test. Values only need to be well-formed, not real.
process.env.EXPO_PUBLIC_BACKEND_API_URL ??= 'https://api.test.local';
process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID ??= 'test-dynamic-env-id';

// The real native module isn't linked in the Jest environment — the
// official in-memory mock, same one AsyncStorage's own docs point to.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
