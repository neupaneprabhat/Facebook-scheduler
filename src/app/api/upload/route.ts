import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg", "video/ogg"];
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    // Accept single file ("file") or multiple files ("files")
    const singleFile = formData.get("file") as File | null;
    const multiFiles = formData.getAll("files") as File[];
    const filesToProcess: File[] = [];

    if (multiFiles && multiFiles.length > 0) {
      filesToProcess.push(...multiFiles.filter((f) => f instanceof File && f.size > 0));
    } else if (singleFile && singleFile instanceof File && singleFile.size > 0) {
      filesToProcess.push(singleFile);
    }

    if (filesToProcess.length === 0) {
      return NextResponse.json({ success: false, error: "No media files provided" }, { status: 400 });
    }

    const uploadedFiles: Array<{
      url: string;
      fileName: string;
      size: number;
      mediaType: "IMAGE" | "VIDEO";
    }> = [];

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    for (const file of filesToProcess) {
      const mimeType = file.type.toLowerCase();
      const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
      const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);

      if (!isImage && !isVideo) {
        return NextResponse.json(
          {
            success: false,
            error: `File "${file.name}" has invalid format. Supported images: JPG, PNG, WEBP. Videos: MP4, MOV, WEBM.`,
          },
          { status: 400 }
        );
      }

      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        return NextResponse.json(
          {
            success: false,
            error: `File "${file.name}" exceeds the ${isVideo ? "100MB" : "15MB"} size limit.`,
          },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = path.extname(file.name) || (isVideo ? ".mp4" : ".jpg");
      const prefix = isVideo ? "fb_vid" : "fb_img";
      const uniqueName = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;

      const filePath = path.join(uploadsDir, uniqueName);
      await fs.writeFile(filePath, buffer);

      uploadedFiles.push({
        url: `/uploads/${uniqueName}`,
        fileName: file.name,
        size: file.size,
        mediaType: isVideo ? "VIDEO" : "IMAGE",
      });
    }

    // Return primary file info + array of all uploaded files
    const primary = uploadedFiles[0];
    return NextResponse.json({
      success: true,
      url: primary.url,
      fileName: primary.fileName,
      size: primary.size,
      mediaType: uploadedFiles.length > 1 ? "MULTI_IMAGE" : primary.mediaType,
      files: uploadedFiles,
      urls: uploadedFiles.map((f) => f.url),
    });
  } catch (error: any) {
    console.error("Media upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload media files" },
      { status: 500 }
    );
  }
}
