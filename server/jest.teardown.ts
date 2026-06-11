import { teardown } from './jest.setup';

export default async function globalTeardown() {
  await teardown();
}
