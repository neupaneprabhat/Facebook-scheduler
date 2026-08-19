const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function encryptToken(plainText) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || 'fbc9e7a884d632f05a9681bc13e01a89c8369ffb19b780bc1a8f9024c088ef31';
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function main() {
  console.log('Seeding initial Facebook Pages and Posts...');

  const page1 = await prisma.facebookPage.upsert({
    where: { pageId: '109823485023910' },
    update: {},
    create: {
      pageId: '109823485023910',
      pageName: 'Black History Official',
      category: 'Community Organization',
      pictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      pageAccessTokenEncrypted: encryptToken('mock_token_black_history'),
      isConnected: true,
    },
  });

  const page2 = await prisma.facebookPage.upsert({
    where: { pageId: '109823485023911' },
    update: {},
    create: {
      pageId: '109823485023911',
      pageName: 'Tech Pulse Daily',
      category: 'Media / News Company',
      pictureUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=150&auto=format&fit=crop&q=80',
      pageAccessTokenEncrypted: encryptToken('mock_token_tech_pulse'),
      isConnected: true,
    },
  });

  // Create an initial sample scheduled post for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(20, 30, 0, 0);

  const existingPost = await prisma.post.findFirst();
  if (!existingPost) {
    await prisma.post.create({
      data: {
        facebookPageId: page1.id,
        caption: "Celebrating remarkable pioneers whose legacies continue to inspire generations worldwide. Stay tuned for our upcoming documentary series!",
        imageUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80",
        scheduledAt: tomorrow,
        timezone: "Asia/Kathmandu",
        status: "SCHEDULED",
      },
    });
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
