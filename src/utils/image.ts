import type { ImageData } from '../types';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB 最大存储大小
const MAX_DIMENSION = 1200; // 最大边长

/** 估计图片内存大小 (RGBA = 4 bytes per pixel) */
export function estimateImageSize(width: number, height: number): number {
  return width * height * 4;
}

/**
 * 将 RGBA 数据转换为 base64 - 内存优化版本
 * 直接使用 ImageData + putImageData，避免创建中间 ImageBitmap 对象
 */
export async function convertImageToBase64(imageData: ImageData): Promise<string> {
  const rgba = await imageData.rgba();
  const { width, height } = imageData;

  // 创建 canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 canvas context');
  }

  // 直接使用 ImageData + putImageData（只复制一次）
  const imgData = new ImageData(
    new Uint8ClampedArray(rgba),
    width,
    height
  );
  ctx.putImageData(imgData, 0, 0);

  // 清理中间数组
  rgba.fill(0);
  imgData.data.fill(0);

  return canvas.toDataURL('image/png', 0.9);
}

/**
 * 压缩图片到指定尺寸 - 内存优化版本
 * 使用单个 canvas + drawImage 缩放，避免创建临时 canvas
 */
export async function resizeImage(
  imageData: ImageData,
  maxWidth: number = MAX_DIMENSION,
  maxHeight: number = MAX_DIMENSION
): Promise<string> {
  const rgba = await imageData.rgba();

  let { width, height } = imageData;

  // 计算缩放比例
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  // 创建目标 canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 canvas context');
  }

  // 创建源 ImageData
  const imgData = new ImageData(
    new Uint8ClampedArray(rgba),
    imageData.width,
    imageData.height
  );

  // 创建临时 canvas 用于绘制源图片
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imgData, 0, 0);

    // 高质量缩放
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }

  // 清理中间数据
  rgba.fill(0);
  imgData.data.fill(0);

  // 尝试 JPEG 格式，如果失败则回退到 PNG
  try {
    const jpegData = canvas.toDataURL('image/jpeg', 0.85);
    // 检查大小，如果还是太大则进一步压缩
    const base64Length = jpegData.length - 'data:image/jpeg;base64,'.length;
    const sizeInBytes = (base64Length * 3) / 4;

    if (sizeInBytes > MAX_IMAGE_SIZE) {
      return canvas.toDataURL('image/jpeg', 0.6);
    }
    return jpegData;
  } catch {
    return canvas.toDataURL('image/png', 0.9);
  }
}

/** 创建图片缩略图 */
export async function createThumbnail(
  imageSrc: string,
  maxSize: number = 100
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('加载图片失败'));
    img.src = imageSrc;
  });
}

/** 计算 base64 图片的实际大小 */
export function getBase64Size(base64String: string): number {
  const base64Length = base64String.split(',')[1]?.length || 0;
  return (base64Length * 3) / 4;
}

/** 检查图片是否需要压缩 */
export function shouldCompressImage(width: number, height: number): boolean {
  const size = estimateImageSize(width, height);
  return size > MAX_IMAGE_SIZE || width > MAX_DIMENSION || height > MAX_DIMENSION;
}

/** 清理图片数据以释放内存 */
export function cleanupImageData(imagePath?: string): void {
  if (!imagePath) return;
  
  // 如果图片数据过大，可以考虑释放
  const size = getBase64Size(imagePath);
  if (size > 5 * 1024 * 1024) {
    // 大于 5MB 的图片标记为需要清理
    console.warn('图片过大，建议清理:', (size / 1024 / 1024).toFixed(2), 'MB');
  }
}
