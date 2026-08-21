import { prisma } from "../../lib/prisma";
import { decryptToken, encryptToken } from "../../lib/crypto";
import path from "path";
import fs from "fs/promises";

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface FacebookPageDTO {
  id: string;
  pageId: string;
  pageName: string;
  category?: string | null;
  pictureUrl?: string | null;
  isConnected: boolean;
  isSimulated?: boolean;
}

export interface PublishResult {
  success: boolean;
  facebookPostId?: string;
  errorMessage?: string;
  publishedAt?: Date;
  isSimulated?: boolean;
}

/**
 * Checks if real Meta App credentials are configured in .env
 */
export function isRealFacebookConfigured(): boolean {
  return Boolean(
    process.env.FACEBOOK_APP_ID &&
    process.env.FACEBOOK_APP_SECRET &&
    process.env.FACEBOOK_APP_ID.trim() !== "" &&
    process.env.FACEBOOK_APP_SECRET.trim() !== ""
  );
}

/**
 * Generates the official Facebook OAuth Login URL
 */
export function getFacebookLoginUrl(state: string = "auth"): string {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || "http://localhost:3000/api/facebook/auth";
  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "public_profile"
  ].join(",");

  if (!appId) {
    return `/api/facebook/mock-connect?state=${state}`;
  }

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scopes}&state=${state}&response_type=code&auth_type=rerequest`;
}

/**
 * Exchanges OAuth authorization code for long-lived User Access Token
 */
export async function connectFacebook(code: string): Promise<{ accessToken: string; expiresIn: number }> {
  if (!isRealFacebookConfigured()) {
    // Return mock access token in Dev mode
    return {
      accessToken: `mock_user_token_${Date.now()}`,
      expiresIn: 5184000, // 60 days
    };
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || "http://localhost:3000/api/facebook/auth";

  // Step 1: Exchange code for short-lived token
  const tokenUrl = `${GRAPH_BASE_URL}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&client_secret=${appSecret}&code=${code}`;

  const res = await fetch(tokenUrl);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "Failed to exchange Facebook authorization code");
  }

  const shortLivedToken = data.access_token;

  // Step 2: Exchange for long-lived User Access Token (60 days)
  const longLivedUrl = `${GRAPH_BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
  const longRes = await fetch(longLivedUrl);
  const longData = await longRes.json();

  return {
    accessToken: longData.access_token || shortLivedToken,
    expiresIn: longData.expires_in || 5184000,
  };
}

/**
 * Fetches all Facebook Pages the user manages via Meta Graph API /me/accounts
 */
export async function getFacebookPages(userAccessToken: string): Promise<Array<{
  id: string;
  name: string;
  category?: string;
  accessToken: string;
  pictureUrl?: string;
}>> {
  if (!isRealFacebookConfigured() || userAccessToken.startsWith("mock_")) {
    // Return predefined realistic mock pages for Dev/Demo mode
    return [
      {
        id: "109823485023910",
        name: "Black History Official",
        category: "Community Organization",
        accessToken: "mock_page_token_black_history",
        pictureUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "109823485023911",
        name: "Tech Pulse Daily",
        category: "Media / News Company",
        accessToken: "mock_page_token_tech_pulse",
        pictureUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "109823485023912",
        name: "Creative Studio Agency",
        category: "Design Agency",
        accessToken: "mock_page_token_creative_studio",
        pictureUrl: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=150&auto=format&fit=crop&q=80",
      },
    ];
  }

  const url = `${GRAPH_BASE_URL}/me/accounts?fields=id,name,category,access_token,picture{url}&access_token=${userAccessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "Failed to retrieve Facebook Pages from Meta API");
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;

  // Exchange each page access token for a long-lived (never-expiring) token
  const pages = await Promise.all(
    (data.data || []).map(async (p: any) => {
      let pageToken = p.access_token;
      try {
        const exchangeUrl = `${GRAPH_BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${pageToken}`;
        const exchangeRes = await fetch(exchangeUrl);
        const exchangeData = await exchangeRes.json();
        if (exchangeRes.ok && !exchangeData.error && exchangeData.access_token) {
          pageToken = exchangeData.access_token; // Long-lived or never-expiring page token
        } else {
          console.warn(`Could not exchange long-lived token for page ${p.id}:`, exchangeData.error?.message);
        }
      } catch (e) {
        console.warn(`Token exchange failed for page ${p.id}:`, e);
      }
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        accessToken: pageToken,
        pictureUrl: p.picture?.data?.url || null,
      };
    })
  );

  return pages;
}

/**
 * Validates whether a Facebook Page Access Token is still active and valid
 */
export async function validateFacebookConnection(pageAccessToken: string): Promise<boolean> {
  if (!pageAccessToken) return false;
  if (!isRealFacebookConfigured() || pageAccessToken.startsWith("mock_")) {
    return true;
  }

  try {
    const url = `${GRAPH_BASE_URL}/me?fields=id,name&access_token=${pageAccessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    return res.ok && !data.error;
  } catch {
    return false;
  }
}

/**
 * Publishes a text-only status update to a Facebook Page via Graph API POST /{page-id}/feed
 */
export async function publishTextPost(
  pageId: string,
  pageAccessToken: string,
  message: string
): Promise<PublishResult> {
  if (!isRealFacebookConfigured() || pageAccessToken.startsWith("mock_")) {
    // Simulated publishing in Dev/Demo mode
    const simPostId = `${pageId}_sim_${Date.now()}`;
    return {
      success: true,
      facebookPostId: simPostId,
      publishedAt: new Date(),
      isSimulated: true,
    };
  }

  try {
    const url = `${GRAPH_BASE_URL}/${pageId}/feed`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        access_token: pageAccessToken,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        errorMessage: data.error?.message || `Facebook API Error code ${data.error?.code || res.status}`,
      };
    }

    return {
      success: true,
      facebookPostId: data.id,
      publishedAt: new Date(),
      isSimulated: false,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || "Network error while publishing text post to Facebook",
    };
  }
}

/**
 * Publishes an image post (with optional caption) to a Facebook Page via Graph API POST /{page-id}/photos
 * Sends local image files directly as binary buffer in FormData so localhost files work seamlessly with Meta API.
 */
export async function publishImagePost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  imageUrlOrPath: string
): Promise<PublishResult> {
  if (!isRealFacebookConfigured() || pageAccessToken.startsWith("mock_")) {
    // Simulated publishing in Dev/Demo mode
    const simPostId = `${pageId}_sim_img_${Date.now()}`;
    return {
      success: true,
      facebookPostId: simPostId,
      publishedAt: new Date(),
      isSimulated: true,
    };
  }

  try {
    const url = `${GRAPH_BASE_URL}/${pageId}/photos`;
    const formData = new FormData();
    formData.append("access_token", pageAccessToken);
    if (message && message.trim() !== "") {
      formData.append("caption", message);
    }

    if (imageUrlOrPath.startsWith("/")) {
      // Local image file: Read bytes from disk and attach directly as binary source
      const localFilePath = path.join(process.cwd(), "public", imageUrlOrPath.replace(/^\//, ""));
      try {
        const fileBuffer = await fs.readFile(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        const blob = new Blob([fileBuffer], { type: mimeType });
        formData.append("source", blob, path.basename(localFilePath));
      } catch (readErr: any) {
        console.error("Local file read error, falling back to URL:", readErr);
        const appUrl = process.env.APP_URL || "http://localhost:3000";
        formData.append("url", `${appUrl}${imageUrlOrPath}`);
      }
    } else {
      // Remote public URL
      formData.append("url", imageUrlOrPath);
    }

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        errorMessage: data.error?.message || `Facebook API Error code ${data.error?.code || res.status}`,
      };
    }

    return {
      success: true,
      facebookPostId: data.post_id || data.id,
      publishedAt: new Date(),
      isSimulated: false,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || "Network error while publishing photo post to Facebook",
    };
  }
}

/**
 * Publishes a video post (with optional caption) to a Facebook Page via Graph API POST /{page-id}/videos
 * Sends local video files directly as binary buffer in FormData so localhost files work seamlessly with Meta API.
 */
export async function publishVideoPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  videoUrlOrPath: string
): Promise<PublishResult> {
  if (!isRealFacebookConfigured() || pageAccessToken.startsWith("mock_")) {
    // Simulated publishing in Dev/Demo mode
    const simPostId = `${pageId}_sim_vid_${Date.now()}`;
    return {
      success: true,
      facebookPostId: simPostId,
      publishedAt: new Date(),
      isSimulated: true,
    };
  }

  try {
    const url = `https://graph-video.facebook.com/${GRAPH_API_VERSION}/${pageId}/videos`;
    const formData = new FormData();
    formData.append("access_token", pageAccessToken);
    if (message && message.trim() !== "") {
      formData.append("description", message);
    }

    if (videoUrlOrPath.startsWith("/")) {
      // Local video file: Read bytes from disk and attach directly as binary source
      const localFilePath = path.join(process.cwd(), "public", videoUrlOrPath.replace(/^\//, ""));
      try {
        const fileBuffer = await fs.readFile(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const mimeType = ext === ".mov" ? "video/quicktime" : ext === ".webm" ? "video/webm" : ext === ".avi" ? "video/x-msvideo" : "video/mp4";
        const blob = new Blob([fileBuffer], { type: mimeType });
        formData.append("source", blob, path.basename(localFilePath));
      } catch (readErr: any) {
        console.error("Local video file read error, falling back to URL:", readErr);
        const appUrl = process.env.APP_URL || "http://localhost:3000";
        formData.append("file_url", `${appUrl}${videoUrlOrPath}`);
      }
    } else {
      // Remote public URL
      formData.append("file_url", videoUrlOrPath);
    }

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        errorMessage: data.error?.message || `Facebook Video API Error code ${data.error?.code || res.status}`,
      };
    }

    return {
      success: true,
      facebookPostId: data.id,
      publishedAt: new Date(),
      isSimulated: false,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || "Network error while publishing video post to Facebook",
    };
  }
}

/**
 * Publishes a multi-image album post to a Facebook Page via Graph API:
 * 1. Uploads each photo as unpublished ({ published: false }) to /{page-id}/photos
 * 2. Creates a feed post with attached_media containing the uploaded photo IDs
 */
export async function publishMultiImagePost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  imageUrls: string[]
): Promise<PublishResult> {
  if (!isRealFacebookConfigured() || pageAccessToken.startsWith("mock_")) {
    const simPostId = `${pageId}_sim_album_${Date.now()}`;
    return {
      success: true,
      facebookPostId: simPostId,
      publishedAt: new Date(),
      isSimulated: true,
    };
  }

  try {
    const mediaFbids: string[] = [];

    // Step 1: Upload each image to Facebook as unpublished
    for (const imgPath of imageUrls) {
      const photoUrl = `${GRAPH_BASE_URL}/${pageId}/photos`;
      const formData = new FormData();
      formData.append("access_token", pageAccessToken);
      formData.append("published", "false");

      if (imgPath.startsWith("/")) {
        const localFilePath = path.join(process.cwd(), "public", imgPath.replace(/^\//, ""));
        try {
          const fileBuffer = await fs.readFile(localFilePath);
          const ext = path.extname(localFilePath).toLowerCase();
          const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
          const blob = new Blob([fileBuffer], { type: mimeType });
          formData.append("source", blob, path.basename(localFilePath));
        } catch (readErr) {
          const appUrl = process.env.APP_URL || "http://localhost:3000";
          formData.append("url", `${appUrl}${imgPath}`);
        }
      } else {
        formData.append("url", imgPath);
      }

      const uploadRes = await fetch(photoUrl, {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        throw new Error(uploadData.error?.message || "Failed to upload photo for multi-image post");
      }

      mediaFbids.push(uploadData.id);
    }

    // Step 2: Publish feed post with attached_media
    const feedUrl = `${GRAPH_BASE_URL}/${pageId}/feed`;
    const feedRes = await fetch(feedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        attached_media: mediaFbids.map((id) => ({ media_fbid: id })),
        access_token: pageAccessToken,
      }),
    });

    const feedData = await feedRes.json();
    if (!feedRes.ok || feedData.error) {
      return {
        success: false,
        errorMessage: feedData.error?.message || `Facebook API Error code ${feedData.error?.code || feedRes.status}`,
      };
    }

    return {
      success: true,
      facebookPostId: feedData.id,
      publishedAt: new Date(),
      isSimulated: false,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || "Network error while publishing multi-photo post to Facebook",
    };
  }
}

/**
 * Executes post publishing through the Facebook Graph API based on media type (Text, Image, Video, Multi-Image).
 * Handles token decryption and records status updates in Prisma.
 */
export async function executePostPublishing(postId: string): Promise<PublishResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      facebookPage: true,
    },
  });

  if (!post) {
    throw new Error(`Post with ID ${postId} not found`);
  }

  // Prevent double-publishing if already published
  if (post.status === "PUBLISHED" && post.facebookPostId) {
    return {
      success: true,
      facebookPostId: post.facebookPostId,
      publishedAt: post.publishedAt || new Date(),
    };
  }

  // Mark as PUBLISHING
  await prisma.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING", errorMessage: null },
  });

  try {
    const rawToken = decryptToken(post.facebookPage.pageAccessTokenEncrypted);

    // Parse mediaUrls if available
    let parsedMediaUrls: string[] = [];
    if (post.mediaUrls) {
      try {
        parsedMediaUrls = JSON.parse(post.mediaUrls);
      } catch {
        parsedMediaUrls = post.mediaUrls.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    let result: PublishResult;

    if (parsedMediaUrls.length > 1) {
      // Multi-photo album post
      result = await publishMultiImagePost(
        post.facebookPage.pageId,
        rawToken,
        post.caption || "",
        parsedMediaUrls
      );
    } else if (post.videoUrl && post.videoUrl.trim() !== "") {
      result = await publishVideoPost(
        post.facebookPage.pageId,
        rawToken,
        post.caption || "",
        post.videoUrl
      );
    } else if (post.imageUrl && post.imageUrl.trim() !== "") {
      result = await publishImagePost(
        post.facebookPage.pageId,
        rawToken,
        post.caption || "",
        post.imageUrl
      );
    } else {
      result = await publishTextPost(
        post.facebookPage.pageId,
        rawToken,
        post.caption || ""
      );
    }

    if (result.success && result.facebookPostId) {
      await prisma.post.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          facebookPostId: result.facebookPostId,
          publishedAt: result.publishedAt || new Date(),
          errorMessage: null,
        },
      });
      return result;
    } else {
      await prisma.post.update({
        where: { id: postId },
        data: {
          status: "FAILED",
          errorMessage: result.errorMessage || "Unknown Facebook Graph API publishing error",
        },
      });
      return result;
    }
  } catch (error: any) {
    const errorMsg = error?.message || "Internal error during Facebook publishing";
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
      },
    });
    return {
      success: false,
      errorMessage: errorMsg,
    };
  }
}

/**
 * Retries a failed post after checking it wasn't already published
 */
export async function retryFacebookPost(postId: string): Promise<PublishResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { facebookPage: true },
  });

  if (!post) {
    throw new Error(`Post with ID ${postId} not found`);
  }

  // Check if already published before retrying to prevent duplicates
  if (post.facebookPostId && post.status === "PUBLISHED") {
    return {
      success: true,
      facebookPostId: post.facebookPostId,
      publishedAt: post.publishedAt || new Date(),
    };
  }

  return executePostPublishing(postId);
}
