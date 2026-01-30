import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

// The AWS SDK will automatically use the environment variables
// (AWS_ENDPOINT_URL, AWS_REGION, etc.) set in docker-compose.yml
// to connect to LocalStack instead of the real AWS.
const s3Client = new S3Client({});

const BUCKET_NAME = "breadsheet-images-local"; // This must match the bucket name in your terraform/s3.tf

/**
 * Resizes an image buffer, uploads it to the S3 bucket, and returns the URL.
 * This function is designed to work with LocalStack for local development.
 *
 * @param imageBuffer The raw buffer of the image to process.
 * @returns The public URL of the uploaded image.
 */
export async function resizeAndUploadImage(imageBuffer: Buffer): Promise<string> {
  console.log("Resizing image...");

  // 1. Resize the image using the 'sharp' library.
  // You can define multiple standard sizes (e.g., thumbnail, medium, large).
  const resizedBuffer = await sharp(imageBuffer)
    .resize({ width: 800 }) // Example: resize to 800px width, maintaining aspect ratio
    .jpeg({ quality: 85 })   // Convert to JPEG with 85% quality
    .toBuffer();

  const imageKey = `${uuidv4()}.jpg`;
  console.log(`Uploading resized image to S3 with key: ${imageKey}`);

  // 2. Upload the resized buffer to S3.
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: imageKey,
    Body: resizedBuffer,
    ContentType: "image/jpeg",
  });

  await s3Client.send(command);

  // 3. Construct and return the public URL for the object in LocalStack.
  const endpointUrl = process.env.AWS_ENDPOINT_URL || `http://localhost:4566`;
  const imageUrl = `${endpointUrl}/${BUCKET_NAME}/${imageKey}`;

  console.log(`Image uploaded successfully: ${imageUrl}`);
  return imageUrl;
}
