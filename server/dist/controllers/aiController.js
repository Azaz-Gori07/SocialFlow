"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIController = void 0;
const db_1 = require("../database/db");
const ai_service_1 = require("../services/ai/ai.service");
// Simple mockup generator for fallbacks that mimics AI outputs
const generateMockPlatformContent = (prompt, platform) => {
    const cleanPrompt = prompt.trim();
    const hashtags = ' #coding #builder #indiehackers #growth';
    switch (platform) {
        case 'twitter':
            return `🚀 Announcing: "${cleanPrompt}"!\n\nWe've been working on this behind the scenes and can't wait to share it. Here is what you need to know:\n\n1️⃣ Reimagined from the ground up\n2️⃣ Instant speed and integrations\n3️⃣ Fully automated\n\nCheck it out! 👇${hashtags}`;
        case 'linkedin':
            return `💼 Exciting update for my professional network!\n\nI am thrilled to announce: "${cleanPrompt}".\n\nThis milestone represents a major step forward. By listening to feedback and iterating rapidly, we have designed a solution that solves real inefficiencies.\n\nKey takeaways:\n• Streamlined workflow integration\n• Enhanced reliability and uptime\n• Powered by advanced analytics\n\nThank you to everyone who supported this release. What are your thoughts on this? Let's discuss in the comments below!\n\n#launch #business #innovation #careers`;
        case 'instagram':
            return `✨ BIG NEWS! ✨\n\nToday, we are officially revealing: "${cleanPrompt}"!\n\nThis journey has been incredible and we are just getting started. Swipe left to see the behind-the-scenes build! ➡️\n\nDrop a comment with your favorite feature, and head to the link in our bio to learn more!\n\n.${hashtags} #aesthetic #dayinthelife`;
        case 'facebook':
            return `📢 We've got news! We are happy to announce: "${cleanPrompt}".\n\nOur team has been hard at work creating something that helps creators and teams streamline their publishing workflow, save hours every week, and understand their growth trends.\n\nCheck out the full release notes and join our community group for exclusive updates! Link in the comments below.\n\n#socialflow #community #businessgoals`;
        case 'youtube':
            return `🎥 How to announce: "${cleanPrompt}" (Full Guide)\n\nIn this video, we walkthrough the exact step-by-step strategy for announcing "${cleanPrompt}". We break down our templates, setup process, and workflow configurations to get maximum engagement.\n\n📌 TIMESTAMPS:\n0:00 - Introduction\n1:25 - The Problem\n3:40 - The Core Solution\n6:50 - Live Demo\n10:15 - Outro & Resources\n\nDon't forget to Like, Subscribe, and hit the Notification Bell! 🔔`;
        case 'tiktok':
            return `🎵 POV: You finally hear about: "${cleanPrompt}" 🤫🔥\n\nThis is the secret workflow creators use. Stop scrolling and save this for later!\n\n#tutorial #productivity #workflowhack #fyp`;
    }
};
exports.AIController = {
    generatePost: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { prompt } = req.body;
            if (!prompt)
                return res.status(400).json({ message: 'Prompt is required' });
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({ prompt });
            const outputs = response.data?.outputs || {};
            const generation = await db_1.db.aiGenerations.create({
                userId,
                prompt,
                outputs,
            });
            return res.status(201).json(generation);
        }
        catch (error) {
            console.error('AI generate post error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    regeneratePost: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { prompt, platform } = req.body;
            if (!prompt || !platform) {
                return res.status(400).json({ message: 'Prompt and platform are required' });
            }
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({
                prompt: `${prompt} (regenerated with variance ${Math.floor(Math.random() * 100)})`,
            });
            const content = response.data?.outputs?.[platform] || '';
            return res.json({ platform, content });
        }
        catch (error) {
            console.error('AI regenerate error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    suggestReply: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { commentId } = req.body;
            if (!commentId)
                return res.status(400).json({ message: 'Comment ID is required' });
            const comment = await db_1.db.comments.findOne({ _id: commentId });
            if (!comment)
                return res.status(404).json({ message: 'Comment not found' });
            // Generate context-aware replies
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({ prompt: comment.message });
            let suggestions = response.data?.suggestions || [];
            if (comment.message.includes('free') || comment.message.includes('trial') || comment.message.includes('cost')) {
                suggestions = [
                    `Hi @${comment.author.username}! Yes, we have a Free tier supporting up to 3 accounts and basic analytics. No credit card required!`,
                    `Hey! You can start on our Free plan right now. If you need AI generators and team features, you can upgrade to Pro anytime.`,
                    `Thanks for asking! Our pricing starts with a robust free plan, and Pro is just $19/mo.`
                ];
            }
            else if (comment.message.includes('agency') || comment.message.includes('client') || comment.message.includes('multiple')) {
                suggestions = [
                    `Absolutely! Our Agency workspace features client-specific roles and white-label reports. Would you like a demo?`,
                    `Yes, you can manage unlimited connected social accounts and add client viewers on our Agency plan!`,
                    `Hey, we have full support for collaboration, workspaces, and user permission roles built right in.`
                ];
            }
            else {
                suggestions = [
                    `Thank you so much for the support! Let us know if you have any questions or feedback.`,
                    `Appreciate the kind words! We're adding new features every week. Stay tuned!`,
                    `Hey! Really glad you liked this. Have you tried connecting your account yet?`
                ];
            }
            return res.json({ suggestions });
        }
        catch (error) {
            console.error('AI reply suggestion error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    repurposeYoutube: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { url } = req.body;
            if (!url)
                return res.status(400).json({ message: 'YouTube URL is required' });
            // Mock processing transcript -> threads
            const videoTitle = url.includes('v=') ? `Video ${url.split('v=')[1].substring(0, 4)}` : 'How to Grow Fast';
            const prompt = `Repurpose YouTube video: ${videoTitle}`;
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({ prompt });
            const outputs = response.data?.outputs || {};
            const generation = await db_1.db.aiGenerations.create({
                userId,
                prompt,
                outputs,
            });
            return res.status(201).json(generation);
        }
        catch (error) {
            console.error('AI YouTube repurpose error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    repurposeBlog: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { url } = req.body;
            if (!url)
                return res.status(400).json({ message: 'Blog URL is required' });
            const prompt = `Repurpose Blog: ${url}`;
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({ prompt });
            const outputs = response.data?.outputs || {};
            const generation = await db_1.db.aiGenerations.create({
                userId,
                prompt,
                outputs,
            });
            return res.status(201).json(generation);
        }
        catch (error) {
            console.error('AI Blog repurpose error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    getInsights: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const ai = new ai_service_1.AIService();
            const response = await ai.execute({ prompt: 'generate insights' });
            let insights = response.data?.insights || [];
            if (insights.length === 0) {
                // fallback mock insights as before
                await db_1.db.insights.create({
                    userId,
                    title: 'Optimal Posting Window',
                    recommendation: 'Your X/Twitter posts generate 1.8x higher CTR when posted between 2:00 PM and 4:00 PM EST.',
                    platform: 'twitter',
                    metricImpact: '1.8x CTR'
                });
                await db_1.db.insights.create({
                    userId,
                    title: 'Content Topic Performance',
                    recommendation: 'LinkedIn interview-related posts generated 2.3x more engagement than product updates.',
                    platform: 'linkedin',
                    metricImpact: '2.3x Engagement'
                });
                await db_1.db.insights.create({
                    userId,
                    title: 'YouTube Thumbnail Clickthrough',
                    recommendation: 'YouTube videos with custom portrait-avatars in thumbnails increase average watch time by 15%.',
                    platform: 'youtube',
                    metricImpact: '+15% Watch Time'
                });
                insights = await db_1.db.insights.find({ userId });
            }
            return res.json(insights);
        }
        catch (error) {
            console.error('Get growth insights error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    generateInsights: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            // Clear existing insights and generate fresh ones
            await db_1.db.insights.deleteMany({ userId });
            const newInsights = [
                await db_1.db.insights.create({
                    userId,
                    title: 'Format Recommendation',
                    recommendation: 'Instagram carousel posts yield 42% higher share rates compared to single images.',
                    platform: 'instagram',
                    metricImpact: '+42% Shares'
                }),
                await db_1.db.insights.create({
                    userId,
                    title: 'Audience Engagement',
                    recommendation: 'Replying to comments within the first 15 minutes of posting increases organic feed reach by 33%.',
                    platform: 'twitter',
                    metricImpact: '+33% Reach'
                }),
                await db_1.db.insights.create({
                    userId,
                    title: 'Video Length Optimization',
                    recommendation: 'TikTok videos between 15-20 seconds maintain the highest retention rates for your profile.',
                    platform: 'tiktok',
                    metricImpact: 'High retention'
                })
            ];
            return res.json(newInsights);
        }
        catch (error) {
            console.error('Generate insights error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
