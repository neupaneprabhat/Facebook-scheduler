const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load env
try {
  const envContent = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = val;
  });
} catch (e) {}

const prisma = new PrismaClient();

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  const rawSecret = process.env.TOKEN_ENCRYPTION_KEY || "fb_scheduler_aes_256_gcm_secret_key_32_bytes";
  const key = crypto.createHash("sha256").update(rawSecret).digest();
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

async function run() {
  const pages = await prisma.facebookPage.findMany();
  console.log("\n====== TOKEN VALIDITY CHECK ======\n");

  for (const pg of pages) {
    const token = decrypt(pg.pageAccessTokenEncrypted);
    console.log(`Page: "${pg.pageName}" (FB ID: ${pg.pageId})`);
    console.log(`Token prefix: ${token.substring(0, 20)}...`);

    // Test 1: /me endpoint
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
    const meData = await meRes.json();
    if (meData.error) {
      console.log(`❌ Token is INVALID: ${meData.error.message}`);
    } else {
      console.log(`✅ Token is VALID. User/Page: ${meData.name} (ID: ${meData.id})`);
    }

    // Test 2: Check if page has reactions permission
    const permRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`);
    const permData = await permRes.json();
    if (!permData.error) {
      const granted = permData.data?.filter((p) => p.status === "granted").map((p) => p.permission);
      const hasReactions = granted?.includes("pages_read_engagement");
      console.log(`Permissions granted: ${granted?.join(", ")}`);
      console.log(`pages_read_engagement: ${hasReactions ? "✅ YES" : "❌ MISSING"}`);
    }
    console.log("");
  }

  // Test against actual post IDs
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED", facebookPostId: { not: null } },
    include: { facebookPage: true },
    take: 2,
  });

  console.log("====== LIVE POST STATS CHECK ======\n");
  for (const post of posts) {
    const token = decrypt(post.facebookPage.pageAccessTokenEncrypted);
    console.log(`Post FB ID: ${post.facebookPostId}`);
    const url = `https://graph.facebook.com/v21.0/${post.facebookPostId}?fields=reactions.summary(total_count),comments.summary(total_count),shares&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.log(`❌ Error: ${data.error.message}`);
    } else {
      console.log(`✅ Reactions: ${data.reactions?.summary?.total_count ?? 0}`);
      console.log(`✅ Comments: ${data.comments?.summary?.total_count ?? 0}`);
      console.log(`✅ Shares: ${data.shares?.count ?? 0}`);
    }
    console.log("");
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
