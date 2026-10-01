import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import { env } from '../../../shared/config/env.config';
import DeveloperSettingsModel from '../settings/settings.model';
import { settingsService } from '../developer.routes';
import { SETTINGS_DEFAULTS } from '../settings/settings.service';
import { AppError } from '../../../shared/errors/appError';

/**
 * Automation settings (tests #13-14).
 *
 * Default-on-for-detection / default-off-for-automation matters: a user who has
 * never opened the settings screen must not have drafts generated for them.
 */

const userId = 'user_settings_1';
const token = jwt.sign({ id: userId, email: 'settings@socialflow.ai' }, env.JWT_SECRET, { expiresIn: '15m' });

async function clearSettings(): Promise<void> {
  await DeveloperSettingsModel.deleteMany({ userId });
}

describe('Developer automation settings', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    env.developerFlowEnabled = false;
    await clearSettings();
  });

  describe('getSettings', () => {
    beforeEach(async () => {
      await clearSettings();
    });

    it('returns safe defaults on the first call and persists the row', async () => {
      const settings = await settingsService.getSettings(userId);

      expect(settings.detectOpportunities).toBe(true);
      expect(settings.generateDrafts).toBe(false);
      expect(settings.autoContent).toBe(false);
      expect(settings.autoPublish).toBe(false);
      expect(settings.schedPeriod).toBe('week');
      expect(settings.schedMinPosts).toBe(1);
      expect(settings.schedMaxPosts).toBe(3);
      expect(settings.defaultTone).toBe('technical');
      expect(settings.timezone).toBe('UTC');

      // The row is created so later updates have something to patch.
      expect(await DeveloperSettingsModel.countDocuments({ userId })).toBe(1);
    });

    it('returns the stored values on the second call', async () => {
      await settingsService.getSettings(userId);
      await settingsService.updateSettings(userId, { defaultTone: 'casual' });

      const settings = await settingsService.getSettings(userId);
      expect(settings.defaultTone).toBe('casual');
    });
  });

  describe('updateSettings validation', () => {
    beforeEach(async () => {
      await clearSettings();
      await settingsService.getSettings(userId);
    });

    it('rejects an inverted min/max range', async () => {
      await expect(
        settingsService.updateSettings(userId, { schedMinPosts: 5, schedMaxPosts: 2 })
      ).rejects.toThrow(AppError.badRequest('schedMinPosts cannot exceed schedMaxPosts'));
    });

    it('rejects a min that exceeds the already-stored max', async () => {
      await settingsService.updateSettings(userId, { schedMaxPosts: 2 });

      await expect(settingsService.updateSettings(userId, { schedMinPosts: 4 })).rejects.toThrow(
        'schedMinPosts cannot exceed schedMaxPosts'
      );
    });

    it('accepts a valid range', async () => {
      const settings = await settingsService.updateSettings(userId, {
        schedMinPosts: 2,
        schedMaxPosts: 4
      });

      expect(settings.schedMinPosts).toBe(2);
      expect(settings.schedMaxPosts).toBe(4);
    });

    it('caps aiInstructions at 4000 characters instead of rejecting them', async () => {
      const settings = await settingsService.updateSettings(userId, {
        aiInstructions: 'x'.repeat(5000)
      });

      expect(settings.aiInstructions).toHaveLength(4000);
    });

    it('ignores an unknown schedPeriod and leaves the stored value alone', async () => {
      const settings = await settingsService.updateSettings(userId, { schedPeriod: 'fortnight' });

      expect(settings.schedPeriod).toBe('week');
    });

    it('accepts a known schedPeriod', async () => {
      const settings = await settingsService.updateSettings(userId, { schedPeriod: 'day' });

      expect(settings.schedPeriod).toBe('day');
    });

    it('ignores a non-boolean for a boolean field', async () => {
      const settings = await settingsService.updateSettings(userId, {
        autoContent: 'yes' as unknown as boolean
      });

      expect(settings.autoContent).toBe(false);
    });

    it('ignores a non-integer for a count field', async () => {
      const settings = await settingsService.updateSettings(userId, {
        schedMaxPosts: 1.5 as unknown as number
      });

      expect(settings.schedMaxPosts).toBe(SETTINGS_DEFAULTS.schedMaxPosts);
    });

    it('clears aiInstructions back to null when set to an empty string', async () => {
      await settingsService.updateSettings(userId, { aiInstructions: 'be technical' });
      const settings = await settingsService.updateSettings(userId, { aiInstructions: '' });

      expect(settings.aiInstructions).toBeNull();
    });
  });

  describe('Route validation (flag on)', () => {
    beforeEach(async () => {
      env.developerFlowEnabled = true;
      await clearSettings();
    });

    afterEach(() => {
      env.developerFlowEnabled = false;
    });

    it('rejects an inverted min/max range with 400', async () => {
      const response = await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({ schedMinPosts: 5, schedMaxPosts: 2 });

      // The zod schema has no cross-field refine, so this is caught by the
      // service and surfaced as a 400 either way.
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects a stringified boolean with 400', async () => {
      const response = await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({ autoContent: 'true' });

      expect(response.status).toBe(400);
    });

    it('rejects an empty patch with 400', async () => {
      const response = await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('rejects an over-long aiInstructions with 400', async () => {
      const response = await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({ aiInstructions: 'x'.repeat(4001) });

      expect(response.status).toBe(400);
    });

    it('applies a valid patch and returns the stored settings', async () => {
      const response = await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({ autoContent: true, schedMinPosts: 1, schedMaxPosts: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data.autoContent).toBe(true);
      expect(response.body.data.schedMaxPosts).toBe(2);
    });

    it('serves the settings over GET', async () => {
      await request(app)
        .patch('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultTone: 'founder' });

      const response = await request(app)
        .get('/api/developer/settings/automation')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.defaultTone).toBe('founder');
    });
  });
});
