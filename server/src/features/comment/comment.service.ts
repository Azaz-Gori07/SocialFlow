import { CommentRepository } from './comment.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { SocialRepository } from '../social/social.repository';
import { UserRepository } from '../user/user.repository';
import { SocialService } from '../social/social.service';
import { OAuthConnectionRepository } from '../social/oauthConnection.repository';
import { OAuthTransactionRepository } from '../social/oauthTransaction.repository';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.types';
import { AppError } from '../../shared/errors/appError';
import { IComment, ICommentReply } from './comment.model';
import { ListCommentsQuery } from './comment.validation';
import { ProviderFactory } from '../../services/social/providers/provider.factory';
import { ProviderError } from '../../services/social/errors/providerError';
import { ProviderCapabilities } from '../../services/social/interfaces/socialProvider.interface';
import mongoose from 'mongoose';
import { env } from '../../shared/config/env.config';

export class CommentService {
  private socialService: SocialService;
  private notificationService = new NotificationService();

  constructor(
    private commentRepository: CommentRepository,
    private workspaceRepository: WorkspaceRepository,
    private socialRepository: SocialRepository,
    private userRepository: UserRepository
  ) {
    this.socialService = new SocialService(
      this.socialRepository,
      new OAuthConnectionRepository(),
      new OAuthTransactionRepository()
    );
  }

  /**
   * Retrieves comments across all social accounts connected by members of a given workspace.
   */
  async listComments(
    workspaceId: string,
    callerId: string,
    filters: ListCommentsQuery
  ): Promise<IComment[]> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    return this.commentRepository.findCommentsByWorkspaceId(workspaceId, filters);
  }

  /**
   * Ingests comments from every connected provider account (guideline §10):
   * paginated fetch -> dedupe upsert by externalCommentId -> mark account synced.
   * Honest per-account errors; one failing account does not block the rest.
   */
  async syncComments(workspaceId: string, callerId: string): Promise<{ accounts: number; comments: number; errors: string[] }> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const members = await this.workspaceRepository.listMembers(workspaceId);
    const accounts = (await Promise.all(
      members.map(m => this.socialRepository.findAccountsByUserId(m.userId))
    )).flat();

    const errors: string[] = [];
    let syncedComments = 0;
    let syncedAccounts = 0;

    for (const account of accounts) {
      try {
        const provider = ProviderFactory.getConfiguredProvider(account.platform);
        const caps: ProviderCapabilities = provider.getCapabilities(account as any);

        if (!caps.commentsRead || !provider.listComments) {
          errors.push(`${account.platform}/${account.username}: comment sync not supported`);
          continue;
        }

        const bundle = await this.socialService.resolveAccountTokenBundle(account._id.toString());
        const ctx = {
          tokens: { accessToken: bundle.accessToken, refreshToken: bundle.refreshToken },
          account: {
            providerAccountId: account.providerAccountId,
            accountType: account.accountType,
            username: account.username,
            displayName: account.displayName
          }
        };

        let cursor: string | undefined;
        let page = 0;
        do {
          const result = await provider.listComments(ctx, { cursor, limit: 50 });
          for (const c of result.items) {
            await this.commentRepository.upsertComment({
              workspaceId,
              platform: account.platform,
              accountId: account._id.toString(),
              externalAccountId: account.providerAccountId,
              externalPostId: c.parentExternalCommentId ? '' : (c as any).externalPostId || '',
              externalCommentId: c.externalCommentId,
              postTitle: undefined,
              author: {
                username: c.author.username,
                displayName: c.author.displayName,
                avatarUrl: c.author.avatarUrl
              },
              message: c.message,
              status: 'unresolved'
            });
            syncedComments += 1;
          }
          cursor = result.nextCursor;
          page += 1;
        } while (cursor && page < 5); // bound: max 5 pages per account per sync

        await this.socialRepository.updateAccount(account._id.toString(), {
          lastSyncedAt: new Date().toISOString()
        });
        syncedAccounts += 1;
      } catch (error: any) {
        errors.push(`${account.platform}/${account.username}: ${error.message}`);
      }
    }

    return { accounts: syncedAccounts, comments: syncedComments, errors };
  }

  /**
   * Sends a reply to the provider FIRST; the local reply is stored only after
   * the platform confirms it (externalReplyId). Never fakes delivery.
   */
  async replyToComment(
    commentId: string,
    message: string,
    workspaceId: string,
    callerId: string
  ): Promise<IComment> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const comment = await this.commentRepository.findCommentById(commentId);
    if (!comment) {
      throw AppError.notFound('Comment not found');
    }
    if (comment.workspaceId !== workspaceId) {
      throw AppError.forbidden('Access denied to comment');
    }

    const user = await this.userRepository.findById(callerId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const account = await this.socialRepository.findAccountById(comment.accountId);
    if (!account) {
      throw AppError.notFound('Connected social account no longer exists');
    }

    const provider = ProviderFactory.getConfiguredProvider(comment.platform);
    const caps: ProviderCapabilities = provider.getCapabilities(account as any);
    if (!caps.commentsWrite || !provider.replyToComment) {
      throw AppError.badRequest(`Replying to comments is not supported for ${comment.platform} (${account.accountType})`);
    }

    const bundle = await this.socialService.resolveAccountTokenBundle(account._id.toString());

    let externalReplyId: string;
    try {
      const result = await provider.replyToComment(
        {
          tokens: { accessToken: bundle.accessToken, refreshToken: bundle.refreshToken },
          account: {
            providerAccountId: account.providerAccountId,
            accountType: account.accountType,
            username: account.username,
            displayName: account.displayName
          }
        },
        comment.externalCommentId,
        message
      );
      externalReplyId = result.externalReplyId;
    } catch (error: any) {
      if (error instanceof ProviderError) {
        throw AppError.providerError(`Reply rejected by ${comment.platform}: ${error.message}`);
      }
      throw AppError.providerError(`Failed to reach ${comment.platform}: ${error.message}`);
    }

    const reply: ICommentReply = {
      author: {
        username: user.email.split('@')[0] || 'admin',
        displayName: user.fullName || 'Admin',
        avatarUrl: user.avatarUrl,
        isSystemUser: true
      },
      message,
      externalReplyId,
      sentToProvider: true,
      createdAt: new Date().toISOString()
    };

    const updatedComment = await this.commentRepository.pushReply(commentId, reply);
    if (!updatedComment) {
      throw AppError.internal('Failed to submit reply');
    }

    const ActivityLogModel = mongoose.models.ActivityLog || mongoose.model('ActivityLog');
    try {
      const log = new ActivityLogModel({
        userId: callerId,
        workspaceId,
        action: 'COMMENT_REPLIED',
        details: `Replied to comment by @${comment.author.username} on ${comment.platform}`
      });
      await log.save();
    } catch (err: any) {
      console.warn('[CommentService] Failed to log activity:', err.message);
    }

    try {
      await this.notificationService.create({
        userId: callerId,
        type: NotificationType.NEW_COMMENT,
        title: 'Comment Replied',
        message: `Replied to comment by @${comment.author.username} on ${comment.platform}`
      });
    } catch (err: any) {
      console.warn('[CommentService] Failed to send notification:', err.message);
    }

    return updatedComment;
  }

  /** Switches comment resolution status. */
  async resolveComment(
    commentId: string,
    status: 'resolved' | 'unresolved',
    workspaceId: string,
    callerId: string
  ): Promise<IComment> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const comment = await this.commentRepository.findCommentById(commentId);
    if (!comment) {
      throw AppError.notFound('Comment not found');
    }
    if (comment.workspaceId !== workspaceId) {
      throw AppError.forbidden('Access denied to comment');
    }

    const updatedComment = await this.commentRepository.updateComment(commentId, { status });
    if (!updatedComment) {
      throw AppError.internal('Failed to update comment status');
    }

    const ActivityLogModel = mongoose.models.ActivityLog || mongoose.model('ActivityLog');
    try {
      const log = new ActivityLogModel({
        userId: callerId,
        workspaceId,
        action: 'COMMENT_STATUS_UPDATED',
        details: `Marked comment by @${comment.author.username} as ${status}`
      });
      await log.save();
    } catch (err: any) {
      console.warn('[CommentService] Failed to log activity:', err.message);
    }

    return updatedComment;
  }

  /** Assigns comment to a workspace teammate. */
  async assignComment(
    commentId: string,
    assignedToUserId: string,
    workspaceId: string,
    callerId: string
  ): Promise<IComment> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const comment = await this.commentRepository.findCommentById(commentId);
    if (!comment) {
      throw AppError.notFound('Comment not found');
    }
    if (comment.workspaceId !== workspaceId) {
      throw AppError.forbidden('Access denied to comment');
    }

    const assignedMember = await this.workspaceRepository.findMember(workspaceId, assignedToUserId);
    if (!assignedMember) {
      throw AppError.badRequest('Assigned user is not a member of this workspace');
    }

    const updatedComment = await this.commentRepository.updateComment(commentId, { assignedTo: assignedToUserId });
    if (!updatedComment) {
      throw AppError.internal('Failed to assign comment');
    }

    const ActivityLogModel = mongoose.models.ActivityLog || mongoose.model('ActivityLog');
    try {
      const log = new ActivityLogModel({
        userId: callerId,
        workspaceId,
        action: 'COMMENT_ASSIGNED',
        details: `Assigned comment by @${comment.author.username} to workspace member`
      });
      await log.save();
    } catch (err: any) {
      console.warn('[CommentService] Failed to log activity:', err.message);
    }

    return updatedComment;
  }

  /**
   * Generates AI suggestions for comment replies. Requires a real AI key —
   * never falls back to canned mock templates.
   */
  async suggestReply(
    commentId: string,
    workspaceId: string,
    callerId: string
  ): Promise<{ professional: string; friendly: string; brand: string }> {
    const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
    if (!callerMember) {
      throw AppError.forbidden('Unauthorized access to workspace data');
    }

    const comment = await this.commentRepository.findCommentById(commentId);
    if (!comment) {
      throw AppError.notFound('Comment not found');
    }
    if (comment.workspaceId !== workspaceId) {
      throw AppError.forbidden('Access denied to comment');
    }

    const message = comment.message;
    const username = comment.author.username;

    if (env.OPENAI_API_KEY) {
      return this.generateSuggestionsWithOpenAI(message, username);
    }
    if (env.CLAUDE_API_KEY) {
      return this.generateSuggestionsWithClaude(message, username);
    }

    throw AppError.badRequest(
      'AI reply suggestions require an API key. Configure OPENAI_API_KEY or CLAUDE_API_KEY to use this feature.'
    );
  }

  private async generateSuggestionsWithOpenAI(message: string, username: string) {
    const prompt = `You are an AI assistant helping a community manager reply to social media comments.
Generate 3 alternative responses to the following comment by user @${username}:
"${message}"

Provide the output in JSON format with exactly three fields:
"professional" (informative, formal, and corporate)
"friendly" (casual, warm, and emoji-friendly)
"brand" (conversion-oriented, aligned with brand personality)

Respond with ONLY the JSON object, no markdown wrappers, no introductory or concluding remarks.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw AppError.providerError(`OpenAI API returned status ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    const parsed = JSON.parse(content);
    return {
      professional: String(parsed.professional || ''),
      friendly: String(parsed.friendly || ''),
      brand: String(parsed.brand || '')
    };
  }

  private async generateSuggestionsWithClaude(message: string, username: string) {
    const prompt = `You are an AI assistant helping a community manager reply to social media comments.
Generate 3 alternative responses to the following comment by user @${username}:
"${message}"

Provide the output in JSON format with exactly three fields:
"professional" (informative, formal, and corporate)
"friendly" (casual, warm, and emoji-friendly)
"brand" (conversion-oriented, aligned with brand personality)

Respond with ONLY the JSON object, no markdown wrappers, no introductory or concluding remarks.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw AppError.providerError(`Claude API returned status ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text?.trim();
    const parsed = JSON.parse(content);
    return {
      professional: String(parsed.professional || ''),
      friendly: String(parsed.friendly || ''),
      brand: String(parsed.brand || '')
    };
  }
}
export default CommentService;
