import mongoose, { Schema, Document, Model } from 'mongoose';

export type AIErrorType =
  | 'generation_failure'
  | 'validation_failure'
  | 'fact_check_failure'
  | 'compliance_failure';

export interface IAIErrorEvent extends Document {
  userId: string;
  repositoryId?: string;
  opportunityId?: string;
  variant?: string;
  errorType: AIErrorType;
  message: string;
  promptSummary?: string;
  avoidanceHint?: string;
  createdAt: Date;
}

const AIErrorEventSchema = new Schema<IAIErrorEvent>(
  {
    userId: { type: String, required: true, index: true },
    repositoryId: { type: String, index: true },
    opportunityId: { type: String, index: true },
    variant: { type: String },
    errorType: {
      type: String,
      required: true,
      enum: ['generation_failure', 'validation_failure', 'fact_check_failure', 'compliance_failure']
    },
    message: { type: String, required: true },
    promptSummary: { type: String },
    avoidanceHint: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AIErrorEventSchema.index({ userId: 1, errorType: 1, createdAt: -1 });

const AIErrorEventModel: Model<IAIErrorEvent> =
  mongoose.models.AIErrorEvent ||
  mongoose.model<IAIErrorEvent>('AIErrorEvent', AIErrorEventSchema);

export default AIErrorEventModel;
