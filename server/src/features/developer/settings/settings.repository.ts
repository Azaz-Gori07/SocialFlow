import DeveloperSettingsModel, { IDeveloperSettings } from './settings.model';

type Query = Record<string, unknown>;

export type DeveloperSettingsPatch = Partial<{
  detectOpportunities: boolean;
  generateDrafts: boolean;
  autoPublish: boolean;
  autoContent: boolean;
  aiInstructions: string | null;
  aiLength: string | null;
  aiTechnicalDepth: string | null;
  schedPeriod: string;
  schedMinPosts: number;
  schedMaxPosts: number;
  maxPostsPerWeek: string | null;
  defaultTone: string;
  timezone: string;
}>;

export class SettingsRepository {
  async findByUser(userId: string): Promise<IDeveloperSettings | null> {
    return DeveloperSettingsModel.findOne({ userId } as Query).exec();
  }

  /** Unique on userId; a concurrent first call is a no-op, not an error. */
  async createDefault(userId: string): Promise<void> {
    try {
      await DeveloperSettingsModel.create({ userId });
    } catch {
      // Already created by a concurrent call.
    }
  }

  async create(userId: string, patch: DeveloperSettingsPatch): Promise<IDeveloperSettings> {
    return DeveloperSettingsModel.create({ userId, ...patch });
  }

  async update(userId: string, patch: DeveloperSettingsPatch): Promise<void> {
    await DeveloperSettingsModel.updateOne({ userId } as Query, { $set: { ...patch } }).exec();
  }
}

export default SettingsRepository;
