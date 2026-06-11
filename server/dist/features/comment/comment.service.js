"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentService = void 0;
const appError_1 = require("../../shared/errors/appError");
const mongoose_1 = __importDefault(require("mongoose"));
const env_config_1 = require("../../shared/config/env.config");
class CommentService {
    commentRepository;
    workspaceRepository;
    socialRepository;
    userRepository;
    constructor(commentRepository, workspaceRepository, socialRepository, userRepository) {
        this.commentRepository = commentRepository;
        this.workspaceRepository = workspaceRepository;
        this.socialRepository = socialRepository;
        this.userRepository = userRepository;
    }
    /**
     * Retrieves comments across all social accounts connected by members of a given workspace
     */
    async listComments(workspaceId, callerId, filters) {
        // 1. Verify caller is a member of the workspace
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
        }
        // 2. Fetch all members of the workspace
        const members = await this.workspaceRepository.listMembers(workspaceId);
        const memberIds = members.map(m => m.userId);
        // 3. Fetch social accounts connected by these workspace members
        const accounts = await Promise.all(memberIds.map(userId => this.socialRepository.findAccountsByUserId(userId)));
        const flatAccounts = accounts.flat();
        if (flatAccounts.length === 0) {
            return [];
        }
        // 4. Extract platform accountIds
        const accountIds = flatAccounts.map(a => a.accountId);
        // 5. Query comments matching the account IDs
        return this.commentRepository.findCommentsByAccountIds(accountIds, filters);
    }
    /**
     * Appends a reply subdocument, sets comment status to 'resolved', and logs activity
     */
    async replyToComment(commentId, message, workspaceId, callerId) {
        // 1. Verify caller is a member of the workspace
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
        }
        // 2. Fetch the comment
        const comment = await this.commentRepository.findCommentById(commentId);
        if (!comment) {
            throw appError_1.AppError.notFound('Comment not found');
        }
        // 3. Verify workspace access
        const members = await this.workspaceRepository.listMembers(workspaceId);
        const memberIds = members.map(m => m.userId);
        const accounts = await Promise.all(memberIds.map(userId => this.socialRepository.findAccountsByUserId(userId)));
        const flatAccounts = accounts.flat();
        const isAccessible = flatAccounts.some(acc => acc.accountId === comment.accountId);
        if (!isAccessible) {
            throw appError_1.AppError.forbidden('Access denied to comment');
        }
        // 4. Retrieve caller details to construct reply author
        const user = await this.userRepository.findById(callerId);
        if (!user) {
            throw appError_1.AppError.notFound('User not found');
        }
        const reply = {
            author: {
                username: user.email.split('@')[0] || 'admin',
                displayName: user.fullName || 'Admin',
                avatarUrl: user.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${callerId}`,
                isSystemUser: true
            },
            message,
            createdAt: new Date().toISOString()
        };
        // 5. Push reply and auto-resolve
        const updatedComment = await this.commentRepository.pushReply(commentId, reply);
        if (!updatedComment) {
            throw appError_1.AppError.internal('Failed to submit reply');
        }
        // 6. Log activity
        const ActivityLogModel = mongoose_1.default.models.ActivityLog || mongoose_1.default.model('ActivityLog');
        const log = new ActivityLogModel({
            userId: callerId,
            workspaceId,
            action: 'COMMENT_REPLIED',
            details: `Replied to comment by @${comment.author.username} on ${comment.platform}`
        });
        await log.save();
        // 7. Create notification for tracking
        const NotificationModel = mongoose_1.default.models.Notification || mongoose_1.default.model('Notification');
        const notification = new NotificationModel({
            userId: callerId,
            title: 'Comment Replied',
            message: `Replied to comment by @${comment.author.username} on ${comment.platform}`,
            read: false,
            type: 'comment'
        });
        await notification.save();
        return updatedComment;
    }
    /**
     * Switches comment resolution status
     */
    async resolveComment(commentId, status, workspaceId, callerId) {
        // 1. Verify caller is a member of the workspace
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
        }
        // 2. Fetch the comment
        const comment = await this.commentRepository.findCommentById(commentId);
        if (!comment) {
            throw appError_1.AppError.notFound('Comment not found');
        }
        // 3. Verify workspace access
        const members = await this.workspaceRepository.listMembers(workspaceId);
        const memberIds = members.map(m => m.userId);
        const accounts = await Promise.all(memberIds.map(userId => this.socialRepository.findAccountsByUserId(userId)));
        const flatAccounts = accounts.flat();
        const isAccessible = flatAccounts.some(acc => acc.accountId === comment.accountId);
        if (!isAccessible) {
            throw appError_1.AppError.forbidden('Access denied to comment');
        }
        // 4. Update status
        const updatedComment = await this.commentRepository.updateComment(commentId, { status });
        if (!updatedComment) {
            throw appError_1.AppError.internal('Failed to update comment status');
        }
        // 5. Log activity
        const ActivityLogModel = mongoose_1.default.models.ActivityLog || mongoose_1.default.model('ActivityLog');
        const log = new ActivityLogModel({
            userId: callerId,
            workspaceId,
            action: 'COMMENT_STATUS_UPDATED',
            details: `Marked comment by @${comment.author.username} as ${status}`
        });
        await log.save();
        return updatedComment;
    }
    /**
     * Assigns comment to a workspace teammate
     */
    async assignComment(commentId, assignedToUserId, workspaceId, callerId) {
        // 1. Verify caller is a member of the workspace
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
        }
        // 2. Fetch the comment
        const comment = await this.commentRepository.findCommentById(commentId);
        if (!comment) {
            throw appError_1.AppError.notFound('Comment not found');
        }
        // 3. Verify workspace access
        const members = await this.workspaceRepository.listMembers(workspaceId);
        const memberIds = members.map(m => m.userId);
        const accounts = await Promise.all(memberIds.map(userId => this.socialRepository.findAccountsByUserId(userId)));
        const flatAccounts = accounts.flat();
        const isAccessible = flatAccounts.some(acc => acc.accountId === comment.accountId);
        if (!isAccessible) {
            throw appError_1.AppError.forbidden('Access denied to comment');
        }
        // 4. Verify that the assigned user is a member of the workspace
        const assignedMember = await this.workspaceRepository.findMember(workspaceId, assignedToUserId);
        if (!assignedMember) {
            throw appError_1.AppError.badRequest('Assigned user is not a member of this workspace');
        }
        // 5. Update assignment
        const updatedComment = await this.commentRepository.updateComment(commentId, { assignedTo: assignedToUserId });
        if (!updatedComment) {
            throw appError_1.AppError.internal('Failed to assign comment');
        }
        // 6. Log activity
        const ActivityLogModel = mongoose_1.default.models.ActivityLog || mongoose_1.default.model('ActivityLog');
        const log = new ActivityLogModel({
            userId: callerId,
            workspaceId,
            action: 'COMMENT_ASSIGNED',
            details: `Assigned comment by @${comment.author.username} to workspace member`
        });
        await log.save();
        return updatedComment;
    }
    /**
     * Generates AI suggestions for comment replies in Professional, Friendly, and Brand tones
     */
    async suggestReply(commentId, workspaceId, callerId) {
        // 1. Verify caller is a member of the workspace
        const callerMember = await this.workspaceRepository.findMember(workspaceId, callerId);
        if (!callerMember) {
            throw appError_1.AppError.forbidden('Unauthorized access to workspace data');
        }
        // 2. Fetch the comment
        const comment = await this.commentRepository.findCommentById(commentId);
        if (!comment) {
            throw appError_1.AppError.notFound('Comment not found');
        }
        // 3. Verify workspace access
        const members = await this.workspaceRepository.listMembers(workspaceId);
        const memberIds = members.map(m => m.userId);
        const accounts = await Promise.all(memberIds.map(userId => this.socialRepository.findAccountsByUserId(userId)));
        const flatAccounts = accounts.flat();
        const isAccessible = flatAccounts.some(acc => acc.accountId === comment.accountId);
        if (!isAccessible) {
            throw appError_1.AppError.forbidden('Access denied to comment');
        }
        const message = comment.message;
        const lowerMessage = message.toLowerCase();
        // Check if we have API Keys configured
        if (env_config_1.env.OPENAI_API_KEY) {
            try {
                return await this.generateSuggestionsWithOpenAI(message, comment.author.username);
            }
            catch (err) {
                console.warn('[CommentService] OpenAI reply generation failed, falling back to mock templates:', err);
            }
        }
        else if (env_config_1.env.CLAUDE_API_KEY) {
            try {
                return await this.generateSuggestionsWithClaude(message, comment.author.username);
            }
            catch (err) {
                console.warn('[CommentService] Claude reply generation failed, falling back to mock templates:', err);
            }
        }
        // Mock Fallback
        if (lowerMessage.includes('free') || lowerMessage.includes('trial') || lowerMessage.includes('cost') || lowerMessage.includes('price') || lowerMessage.includes('pricing')) {
            return {
                professional: `Thank you for your inquiry. SocialFlow offers a comprehensive free tier supporting up to 3 social media accounts along with standard analytics features. No credit card is required to begin, and you can evaluate our features at your convenience.`,
                friendly: `Hi @${comment.author.username}! 😊 Yes, we absolutely do! You can connect up to 3 accounts on our free plan without entering any card info. Feel free to give it a spin and let us know what you think!`,
                brand: `Start growing your social presence today with SocialFlow's free plan! Manage 3 accounts at zero cost, and upgrade to Pro for advanced AI features whenever you are ready.`
            };
        }
        else if (lowerMessage.includes('agency') || lowerMessage.includes('client') || lowerMessage.includes('multiple') || lowerMessage.includes('team') || lowerMessage.includes('collaborate')) {
            return {
                professional: `SocialFlow provides dedicated support for agency workflows, including multi-tenant workspaces, granular team permission roles, and white-label reporting. We would be pleased to schedule a demonstration for your team.`,
                friendly: `Oh, absolutely! 🚀 Our Agency workspace is built for this—you can manage multiple client accounts and assign custom roles to your teammates. Let us know if you'd like a quick walkthrough!`,
                brand: `Scale your agency effortlessly. SocialFlow's multi-tenant workspaces and custom teammate roles keep your client management seamless and professional. Try our Agency features today!`
            };
        }
        else {
            return {
                professional: `We appreciate your feedback regarding SocialFlow. Please let us know if you require any assistance or have additional inquiries about our features.`,
                friendly: `Thank you so much for the support! ❤️ We are constantly rolling out updates, so keep an eye out. Let us know if there's anything else you'd like to see!`,
                brand: `Thanks for connecting with SocialFlow! We're here to help you automate and optimize your content strategy. Have you connected your first platform yet?`
            };
        }
    }
    async generateSuggestionsWithOpenAI(message, username) {
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
                'Authorization': `Bearer ${env_config_1.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            })
        });
        if (!response.ok) {
            throw new Error(`OpenAI API returned status ${response.status}`);
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        return JSON.parse(content);
    }
    async generateSuggestionsWithClaude(message, username) {
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
                'x-api-key': env_config_1.env.CLAUDE_API_KEY,
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
            throw new Error(`Claude API returned status ${response.status}`);
        }
        const data = await response.json();
        const content = data.content?.[0]?.text?.trim();
        return JSON.parse(content);
    }
}
exports.CommentService = CommentService;
exports.default = CommentService;
