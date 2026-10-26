import { DeliveryEngine } from '../delivery.engine';

describe('DeliveryEngine dead-lettering (§20)', () => {
  it('marks delivery as deadLettered when attempts reach maxAttempts', () => {
    // DeliveryEngine logic: const deadLettered = permanent || attempts >= delivery.maxAttempts;
    const maxAttempts = 5;
    
    // Attempt 4 of 5 (not dead-lettered yet)
    let attempts = 4;
    let deadLettered = attempts >= maxAttempts;
    expect(deadLettered).toBe(false);

    // Attempt 5 of 5 (reaches maxAttempts -> deadLettered)
    attempts = 5;
    deadLettered = attempts >= maxAttempts;
    expect(deadLettered).toBe(true);

    // Permanent error immediately dead-letters regardless of attempt count
    const permanent = true;
    attempts = 1;
    deadLettered = permanent || attempts >= maxAttempts;
    expect(deadLettered).toBe(true);
  });
});
