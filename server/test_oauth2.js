async function main() {
const dotenv = require("dotenv");
dotenv.config();
const { TwitterProvider } = require("./dist/services/social/providers/twitter.provider");
const { LinkedInProvider } = require("./dist/services/social/providers/linkedin.provider");
const { YouTubeProvider } = require("./dist/services/social/providers/youtube.provider");

const twitter = new TwitterProvider();
const redirectUri = "https://socialflow-src9.onrender.com/api/social/callback/twitter";
const twitterUrl = twitter.getAuthorizationUrl("test_state_123", redirectUri);
console.log("=== OAUTH URL GENERATION ===");
console.log("Twitter URL generated: " + (twitterUrl.startsWith("https://twitter.com/i/oauth2/authorize") ? "YES" : "NO"));
console.log("  Contains client_id: " + twitterUrl.includes("client_id="));
console.log("  Contains code_challenge: " + twitterUrl.includes("code_challenge="));
console.log("  Contains redirect_uri: " + twitterUrl.includes("redirect_uri="));

const linkedin = new LinkedInProvider();
const linkedinUrl = linkedin.getAuthorizationUrl("test_state_456", "https://socialflow-src9.onrender.com/api/social/callback/linkedin");
console.log("\nLinkedIn URL generated: " + (linkedinUrl.startsWith("https://www.linkedin.com/oauth/v2/authorization") ? "YES" : "NO"));
console.log("  Contains w_member_social: " + linkedinUrl.includes("w_member_social"));

const youtube = new YouTubeProvider();
const youtubeUrl = youtube.getAuthorizationUrl("test_state_789", "https://socialflow-src9.onrender.com/api/social/callback/youtube");
console.log("\nYouTube URL generated: " + (youtubeUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth") ? "YES" : "NO"));
console.log("  Contains access_type=offline: " + youtubeUrl.includes("access_type=offline"));
}
main().catch(e => console.error(e));
