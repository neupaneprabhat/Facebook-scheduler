const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

try {
  const envContent = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8");
  envContent.split("\n").forEach((line) => {
    const parts = line.trim().split("=");
    if (parts.length >= 2 && !parts[0].startsWith("#")) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
} catch {}

const prisma = new PrismaClient();

function decryptToken(encryptedText) {
  if (!encryptedText) return "";
  if (!encryptedText.includes(":")) return encryptedText;
  try {
    const rawSecret = process.env.TOKEN_ENCRYPTION_KEY || "fb_scheduler_aes_256_gcm_secret_key_32_bytes";
    const key = crypto.createHash("sha256").update(rawSecret).digest();
    const parts = encryptedText.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return "";
  }
}

async function run() {
  const posts = await prisma.post.findMany({
    include: { facebookPage: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  console.log(`Found ${posts.length} posts in DB:`);
  for (const post of posts) {
    console.log(`\nPost ID: ${post.id}`);
    console.log(`Caption: ${post.caption}`);
    console.log(`Status: ${post.status}`);
    console.log(`FB Post ID: ${post.facebookPostId}`);
    console.log(`Page: ${post.facebookPage?.pageName} (${post.facebookPage?.pageId})`);

    if (post.status === "PUBLISHED" && post.facebookPostId) {
      const token = decryptToken(post.facebookPage?.pageAccessTokenEncrypted);
      console.log(`Token starts with: ${token.substring(0, 15)}...`);

      const targetIds = [post.facebookPostId];
      if (post.facebookPostId.includes("_")) {
        targetIds.push(post.facebookPostId.split("_")[1]);
      }

      for (const tid of targetIds) {
        try {
          const url = `https://graph.facebook.com/v21.0/${tid}?fields=reactions.summary(total_count).limit(0),likes.summary(true).limit(0),comments.summary(total_count).limit(0),comments.summary(true),shares,permalink_url&access_token=${token}`;
          const res = await fetch(url);
          const data = await res.json();
          console.log(`\nResults for target ID [${tid}]:`, JSON.stringify(data, null, 2));
        } catch (e) {
          console.error(`Error querying ${tid}:`, e.message);
        }
      }
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
