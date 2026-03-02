import type { ImageData } from '../types';

/** 图片数据转 base64 */
export async function convertImageToBase64(imageData: ImageData): Promise<string> {
  const width = imageData.width;
  const height = imageData.height;
  
  try {
    const rgba = await imageData.rgba();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imageDataObj = ctx.createImageData(width, height);
    imageDataObj.data.set(rgba);
    ctx.putImageData(imageDataObj, 0, 0);

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[ClipJar] 图片转换失败:', e);
    return '';
  }
}

/** 压缩 base64 图片 */
export function compressBase64Image(base64: string, maxWidth: number = 200): string {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // 等比缩放
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64;
  }) as any;
}
