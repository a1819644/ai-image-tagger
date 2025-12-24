import type { Metadata, GeoLocation } from '../types';

// Let TypeScript know piexif is available on the window
declare var piexif: any;

/**
 * Converts a string to a UCS-2 / UTF-16LE byte array for Windows XP EXIF tags.
 * Windows specifically looks for these for the "Details" tab in File Explorer.
 */
const toXPString = (str: string): number[] => {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        // Low byte
        bytes.push(charCode & 0xFF);
        // High byte
        bytes.push((charCode >> 8) & 0xFF);
    }
    // Add null terminator (2 bytes for UTF-16)
    bytes.push(0, 0);
    return bytes;
};

/**
 * Converts decimal degrees to DMS (degrees, minutes, seconds) format for EXIF.
 */
const toDMS = (deg: number): [[number, number], [number, number], [number, number]] => {
    const d = Math.abs(deg);
    const degrees = Math.floor(d);
    const minutes = Math.floor((d - degrees) * 60);
    const seconds = Math.round(((d - degrees) * 60 - minutes) * 60 * 100);
    return [[degrees, 1], [minutes, 1], [seconds, 100]];
};

export const convertBlobToJpegDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            URL.revokeObjectURL(img.src);
            resolve(dataUrl);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
        img.src = URL.createObjectURL(blob);
    });
};

export const resizeImage = (imageBlob: Blob, targetAspectRatio: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            let canvasWidth, canvasHeight;
            const originalAspectRatio = img.width / img.height;

            if (originalAspectRatio > targetAspectRatio) {
                // Image is wider than target frame - fill height and crop sides (Cover)
                canvasHeight = img.height;
                canvasWidth = img.height * targetAspectRatio;
            } else {
                // Image is narrower than target frame - fill width and crop top/bottom (Cover)
                canvasWidth = img.width;
                canvasHeight = img.width / targetAspectRatio;
            }

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            // Draw image exactly centered and scaled to cover the entire canvas
            const xOffset = (canvasWidth - img.width) / 2;
            const yOffset = (canvasHeight - img.height) / 2;
            ctx.drawImage(img, xOffset, yOffset);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob from canvas.'));
                    }
                    URL.revokeObjectURL(img.src);
                },
                'image/jpeg',
                0.95
            );
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
        img.src = URL.createObjectURL(imageBlob);
    });
};

export const upscaleImageToHeight = (imageBlob: Blob, targetHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // If the image is already large enough, no need to upscale.
            if (img.height >= targetHeight) {
                URL.revokeObjectURL(img.src);
                return resolve(imageBlob);
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(img.src);
                return reject(new Error('Could not get canvas context'));
            }

            const aspectRatio = img.width / img.height;
            const newHeight = targetHeight;
            const newWidth = newHeight * aspectRatio;

            canvas.width = newWidth;
            canvas.height = newHeight;

            // High-quality drawing settings
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob from canvas for upscaling.'));
                    }
                    URL.revokeObjectURL(img.src);
                },
                'image/jpeg', 0.95 // Use JPEG to keep payload size reasonable for API calls
            );
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
        img.src = URL.createObjectURL(imageBlob);
    });
};


export const embedMetadata = async (imageBlob: Blob, metadata: Metadata, businessName: string, location: GeoLocation): Promise<Blob> => {
    if (typeof piexif === 'undefined') {
        console.error("piexif.js is not loaded. Cannot embed metadata.");
        const jpegDataUrl = await convertBlobToJpegDataURL(imageBlob);
        const res = await fetch(jpegDataUrl);
        return res.blob();
    }

    try {
        const jpegDataUrl = await convertBlobToJpegDataURL(imageBlob);

        const zeroth: any = {};
        const exif: any = {};
        const gps: any = {};

        // Tags in Windows are usually semicolon separated
        const allTags = [...new Set([...metadata.tags, businessName])];
        const tagsString = allTags.join('; ');

        // --- Standard EXIF Tags (0th IFD) ---
        // Artist maps to "Authors" in many viewers
        zeroth[piexif.ImageIFD.Artist] = businessName;
        // Copyright (0x8298)
        zeroth[piexif.ImageIFD.Copyright] = `Copyright ${new Date().getFullYear()} ${businessName}. All Rights Reserved.`;

        // IMPORTANT: Windows Title often reads from ImageDescription if XPTitle isn't present
        // or uses it as a fallback. We sync them both to metadata.name for consistency.
        zeroth[piexif.ImageIFD.ImageDescription] = metadata.name;

        zeroth[piexif.ImageIFD.Software] = "Asset Master SEO Tagger";
        zeroth[piexif.ImageIFD.DateTime] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/-/g, ':');

        // --- Windows Specific XP Tags (Hex IDs for robustness) ---
        // 0x9C9B (40091): XPTitle -> Maps to "Title"
        zeroth[40091] = toXPString(metadata.name);

        // 0x9C9C (40092): XPComment -> Maps to "Comments"
        zeroth[40092] = toXPString(metadata.description);

        // 0x9C9D (40093): XPAuthor -> Maps to "Authors"
        zeroth[40093] = toXPString(businessName);

        // 0x9C9E (40094): XPKeywords -> Maps to "Tags"
        zeroth[40094] = toXPString(tagsString);

        // 0x9C9F (40095): XPSubject -> Maps to "Subject"
        zeroth[40095] = toXPString(metadata.caption);

        // --- Exif IFD ---
        // UserComment (0x9286)
        exif[piexif.ExifIFD.UserComment] = metadata.description;

        // --- GPS Data ---
        gps[piexif.GPSIFD.GPSLatitudeRef] = location.lat < 0 ? 'S' : 'N';
        gps[piexif.GPSIFD.GPSLatitude] = toDMS(location.lat);
        gps[piexif.GPSIFD.GPSLongitudeRef] = location.lng < 0 ? 'W' : 'E';
        gps[piexif.GPSIFD.GPSLongitude] = toDMS(location.lng);
        gps[piexif.GPSIFD.GPSDateStamp] = new Date().toISOString().split('T')[0].replace(/-/g, ':');

        const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
        const exifbytes = piexif.dump(exifObj);

        // Remove existing EXIF before inserting new ones to avoid data corruption or conflicts
        const cleanJpegDataUrl = piexif.remove(jpegDataUrl);
        const newImageDataUrl = piexif.insert(exifbytes, cleanJpegDataUrl);

        const res = await fetch(newImageDataUrl);
        return res.blob();

    } catch (error) {
        console.error("Error embedding metadata:", error);
        // Fallback to a plain JPEG conversion if Exif embedding fails
        const originalDataUrl = await convertBlobToJpegDataURL(imageBlob);
        const res = await fetch(originalDataUrl);
        return res.blob();
    }
};

export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
            URL.revokeObjectURL(img.src);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
        img.src = URL.createObjectURL(file);
    });
};

export const validateImageDimensions = async (file: File, minHeight: number, minWidth: number): Promise<void> => {
    const { width, height } = await getImageDimensions(file);
    if (height < minHeight) {
        throw new Error(`Image height must be at least ${minHeight}px. Current height: ${height}px.`);
    }
    if (width < minWidth) {
        throw new Error(`Image width must be at least ${minWidth}px. Current width: ${width}px.`);
    }
}
